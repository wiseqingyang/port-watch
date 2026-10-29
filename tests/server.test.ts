import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { createServer } from '../src/server.js';
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
