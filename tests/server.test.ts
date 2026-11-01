import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../src/server.js';
import { createFavoritesStore } from '../src/favorites.js';
import { AppError } from '../src/system.js';
import { service, response } from './fixtures.js';

const token = 'a'.repeat(64);

test('API requires the session token, trusted host/origin, and a current service identity', async t => {
  let stopped = 0;
  let revealed = '';
  let scanCount = 0;
  const server = createServer({ token, host: '127.0.0.1', scan: async () => { scanCount++; return response(); },
    stop: async (_service, force) => { stopped++; assert.equal(force, false); return { pid: service.pid, success: true, code: 'STOPPED' }; },
    reveal: async directory => { revealed = directory; },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const auth = { Authorization: `Bearer ${token}` };
  const post = (url: string, body: unknown, extra = {}) => fetch(base + url, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.equal((await fetch(base + '/api/services')).status, 401);
  assert.equal((await fetch(base + '/api/health', { headers: { Authorization: `Bearer ${'b'.repeat(64)}` } })).status, 401);
  assert.equal(scanCount, 0, 'unauthenticated requests must not invoke OS scanning');
  assert.equal((await fetch(base + '/api/services', { headers: { ...auth, Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(base + '/api/services', { headers: { ...auth, Origin: 'null' } })).status, 403);
  const badHost = await new Promise<number | undefined>((resolve, reject) => {
    get(base + '/api/services', { headers: { ...auth, Host: `attacker.example:${port}` } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(badHost, 403);
  assert.equal((await fetch(base + '/api/services', { headers: { ...auth, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(base + '/api/services/kill', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST' } })).status, 403);
  const good = await fetch(base + '/api/services', { headers: { ...auth, Origin: base } });
  assert.equal(good.status, 200);
  assert.equal(good.headers.get('access-control-allow-origin'), null);
  assert.equal(good.headers.get('cache-control'), 'no-store');
  assert.equal((await good.json()).services[0].id, service.id);
  assert.equal((await post('/api/services/kill', { pid: service.pid })).status, 400);
  assert.equal((await post('/api/services/kill', { serviceId: service.id, force: 'false' })).status, 400);
  assert.equal((await post('/api/services/kill', { serviceId: `9:${'0'.repeat(24)}` })).status, 409);
  assert.equal((await post('/api/services/restart', { pid: 123, cwd: '/tmp', command: 'unexpected' })).status, 404);
  assert.equal((await post('/api/services/batch-kill', { pids: [123] })).status, 404);
  assert.equal((await post('/api/services/kill', { serviceId: service.id })).status, 200);
  assert.equal(stopped, 1);
  assert.equal((await post('/api/services/reveal', { targetPath: '/tmp/project' })).status, 200);
  assert.equal(revealed, '/tmp/project');
  assert.equal((await post('/api/services/reveal', { targetPath: '/tmp/unrelated' })).status, 403);
  assert.equal((await post('/api/services/reveal', { targetPath: '$(touch marker)' })).status, 400);
  const malformed = await fetch(base + '/api/services/kill', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const compressed = await fetch(base + '/api/services/kill', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: 'invalid compressed bytes' });
  assert.equal(compressed.status, 415);
  assert.equal((await fetch(base + '/api/health', { headers: auth })).status, 200);
});

test('scan errors are explicit; protected processes never reach the stop implementation', async t => {
  let fail = true;
  const server = createServer({ token, host: '127.0.0.1', scan: async () => {
    if (fail) throw new AppError('MISSING_TOOL', 'lsof missing', 503);
    return response([{ ...service, protectedReason: 'SYSTEM_PROCESS' }]);
  }, stop: async () => { throw new Error('must not be invoked'); } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const result = await fetch(base + '/api/services', { headers });
  assert.equal(result.status, 503); assert.equal((await result.json()).code, 'MISSING_TOOL');
  fail = false;
  assert.equal((await fetch(base + '/api/services/kill', { method: 'POST', headers, body: JSON.stringify({ serviceId: service.id }) })).status, 403);
});

test('concurrent service reads share one scan', async t => {
  let count = 0;
  const server = createServer({ token, host: '127.0.0.1', scan: async () => {
    count++; await new Promise(resolve => setTimeout(resolve, 60)); return response();
  } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/services`;
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(url, { headers: { Authorization: `Bearer ${token}` } })));
  assert.ok(responses.every(r => r.status === 200)); assert.equal(count, 1);
});

test('favorites API persists services and allows revealing or opening terminal for offline favorites', async t => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'portwatch-server-fav-'));
  const favoritesFile = path.join(tmp, 'favorites.json');
  let isServiceOnline = true;
  let revealed = '';
  let openedTerminal = '';

  const server = createServer({
    token,
    host: '127.0.0.1',
    favoritesFile,
    scan: async () => (isServiceOnline ? response([service]) : response([])),
    reveal: async directory => { revealed = directory; },
    terminal: async directory => { openedTerminal = directory; },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');

  t.after(async () => {
    server.closeAllConnections();
    server.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1. Add favorite while service is online
  const addRes = await fetch(base + '/api/favorites', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ serviceId: service.id }),
  });
  assert.equal(addRes.status, 200);
  const addBody = await addRes.json();
  const favId = addBody.favorite.favoriteId as string;
  assert.match(favId, /^[a-f0-9]{24}$/);

  // 2. Scan and saved history are read independently
  const listOnline = await (await fetch(base + '/api/services', { headers: auth })).json();
  assert.equal(listOnline.services[0].id, service.id);
  assert.equal(listOnline.favorites, undefined);
  const savedOnline = await (await fetch(base + '/api/favorites', { headers: auth })).json();
  assert.equal(savedOnline.favorites[0].favoriteId, favId);

  // 3. Simulate system restart (new server instance with empty scan, reading persisted favoritesFile)
  const restartedServer = createServer({
    token,
    host: '127.0.0.1',
    favoritesFile,
    scan: async () => response([]),
    reveal: async directory => { revealed = directory; },
    terminal: async directory => { openedTerminal = directory; },
  }).listen(0, '127.0.0.1');
  await once(restartedServer, 'listening');
  t.after(() => {
    restartedServer.closeAllConnections();
    restartedServer.close();
  });
  const restartedPort = (restartedServer.address() as { port: number }).port;
  const restartedBase = `http://127.0.0.1:${restartedPort}`;

  const listOffline = await (await fetch(restartedBase + '/api/services', { headers: auth })).json();
  assert.equal(listOffline.services.length, 0);
  const savedOffline = await (await fetch(restartedBase + '/api/favorites', { headers: auth })).json();
  assert.equal(savedOffline.favorites.length, 1);

  // 4. Offline favorite directory is still allowed for reveal & openTerminal
  const revealRes = await fetch(restartedBase + '/api/services/reveal', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ targetPath: '/tmp/project' }),
  });
  assert.equal(revealRes.status, 200);
  assert.equal(revealed, '/tmp/project');

  const termRes = await fetch(restartedBase + '/api/services/terminal', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ targetPath: '/tmp/project' }),
  });
  assert.equal(termRes.status, 200);
  assert.equal(openedTerminal, '/tmp/project');

  // Unrelated path is still forbidden
  const badTermRes = await fetch(restartedBase + '/api/services/terminal', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ targetPath: '/tmp/other' }),
  });
  assert.equal(badTermRes.status, 403);

  // 5. Delete favorite; offline directory should no longer be allowed
  const delRes = await fetch(`${restartedBase}/api/favorites/${favId}`, {
    method: 'DELETE',
    headers: auth,
  });
  assert.equal(delRes.status, 200);

  const revealAfterDel = await fetch(restartedBase + '/api/services/reveal', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ targetPath: '/tmp/project' }),
  });
  assert.equal(revealAfterDel.status, 403);
});

test('favorites API reports storage failures instead of success and permits retry', async t => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'portwatch-favorites-api-'));
  const blocked = path.join(tmp, 'blocked');
  await writeFile(blocked, 'not a directory');
  const server = createServer({
    token, host: '127.0.0.1', favoritesFile: path.join(blocked, 'favorites.json'), scan: async () => response(),
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); server.close(); await rm(tmp, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const add = () => fetch(base + '/api/favorites', { method: 'POST', headers, body: JSON.stringify({ serviceId: service.id }) });
  const failed = await add();
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).code, 'FAVORITES_WRITE_FAILED');
  await rm(blocked);
  const beforeRetry = await fetch(base + '/api/favorites', { headers });
  assert.deepEqual((await beforeRetry.json()).favorites, [], 'failure must not leave a phantom favorite');
  assert.equal((await add()).status, 200);
  assert.equal((await (await fetch(base + '/api/favorites', { headers })).json()).favorites.length, 1);
});

async function isolatedFavoritesServer(t: import('node:test').TestContext, scan: Parameters<typeof createServer>[0]['scan']) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'portwatch-independent-'));
  const file = path.join(tmp, 'favorites.json');
  const revealed: string[] = [];
  const server = createServer({ token, host: '127.0.0.1', favoritesFile: file, scan,
    reveal: async directory => { revealed.push(directory); }, terminal: async directory => { revealed.push(directory); },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); server.close(); await rm(tmp, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const request = (route: string, body?: unknown) => fetch(base + '/api' + route, {
    headers, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000),
  });
  return { file, request, revealed };
}

test('scan failure leaves favorites readable and their directory actions usable', async t => {
  const { file, request, revealed } = await isolatedFavoritesServer(t, async () => { throw new AppError('SCAN_FAILED', 'Scan unavailable', 503); });
  const favorite = await createFavoritesStore(file).add(service);
  assert.equal((await request('/services')).status, 503);
  const saved = await request('/favorites');
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).favorites[0].favoriteId, favorite.favoriteId);
  assert.equal((await request('/services/reveal', { targetPath: service.cwd })).status, 200);
  assert.equal((await request('/services/terminal', { targetPath: service.cwd })).status, 200);
  assert.deepEqual(revealed, [service.cwd, service.cwd]);
});

test('favorites do not wait for an in-flight scan or initiate a scan themselves', async t => {
  let complete!: () => void;
  let started!: () => void;
  let count = 0;
  const gate = new Promise<void>(resolve => { complete = resolve; });
  const scanning = new Promise<void>(resolve => { started = resolve; });
  const { file, request } = await isolatedFavoritesServer(t, async () => { count++; started(); await gate; return response(); });
  await createFavoritesStore(file).add(service);
  assert.equal((await request('/favorites')).status, 200);
  assert.equal(count, 0);
  const pendingScan = request('/services');
  try {
    await scanning;
    const saved = await request('/favorites');
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).favorites.length, 1);
  } finally { complete(); await pendingScan; }
});

test('corrupt favorites do not block running services or their directory actions', async t => {
  const { file, request, revealed } = await isolatedFavoritesServer(t, async () => response());
  await writeFile(file, 'corrupt');
  const running = await request('/services');
  assert.equal(running.status, 200);
  assert.equal((await running.json()).services[0].id, service.id);
  assert.equal((await request('/favorites')).status, 500);
  assert.equal((await request('/services/reveal', { targetPath: service.cwd })).status, 200);
  assert.equal((await request('/services/terminal', { targetPath: service.cwd })).status, 200);
  assert.deepEqual(revealed, [service.cwd, service.cwd]);
});

test('upgrading without a favorites file returns an empty collection and a successful scan', async t => {
  const { request } = await isolatedFavoritesServer(t, async () => response());
  assert.deepEqual((await (await request('/favorites')).json()).favorites, []);
  assert.equal((await request('/services')).status, 200);
  assert.deepEqual((await (await request('/favorites')).json()).favorites, []);
});

test('history sync uses the cached observation time rather than the time favorites are read', async t => {
  const observedAt = Date.now() + 1000;
  const { file, request } = await isolatedFavoritesServer(t, async () => ({ ...response(), overview: { ...response().overview, timestamp: observedAt } }));
  await createFavoritesStore(file).add(service);
  await request('/services');
  const saved = await (await request('/favorites')).json();
  assert.equal(saved.favorites[0].lastSeenAt, observedAt);
});
