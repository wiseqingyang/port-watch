import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtemp, mkdir, rm, readFile, writeFile, utimes } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { createFavoritesStore, computeFavoriteId } from '../src/favorites.js';
import { service } from './fixtures.js';

test('favorites store persists snapshots to disk and matches restarted services across PID or port changes', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'portwatch-favorites-'));
  const filePath = path.join(tmp, 'config', 'favorites.json');
  const projectDir = path.join(tmp, 'my-app');
  await mkdir(projectDir, { recursive: true });

  try {
    const store1 = createFavoritesStore(filePath);
    const liveService = {
      ...service,
      cwd: projectDir,
      port: 3000,
      ports: [3000],
      command: 'node ./node_modules/.bin/vite --port 3000',
    };

    const fav = await store1.add(liveService);
    assert.equal(fav.favoriteId, computeFavoriteId(liveService));
    assert.equal(fav.cwd, projectDir);
    assert.equal(fav.lastPort, 3000);
    assert.equal(fav.cwdExists, true);

    // Reload from a fresh store instance (simulating system reboot / process restart)
    const store2 = createFavoritesStore(filePath);
    const listed = await store2.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].favoriteId, fav.favoriteId);
    assert.equal(listed[0].cwdExists, true);

    // Simulate service restarted with a new PID and a new dynamic port (3001)
    const restartedService = {
      ...liveService,
      id: `99999:${'b'.repeat(24)}`,
      pid: 99999,
      port: 3001,
      ports: [3001],
      command: 'node ./node_modules/.bin/vite --port 3001',
    };

    const synced = await store2.syncWithServices([restartedService]);
    assert.equal(synced.services[0].favoriteId, fav.favoriteId);
    assert.equal(synced.favorites[0].lastPort, 3001);

    // Remove favorite
    assert.equal(await store2.remove(fav.favoriteId), true);
    assert.equal((await store2.list()).length, 0);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

async function temporaryStore(t: import('node:test').TestContext) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'portwatch-favorites-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));
  return { tmp, file: path.join(tmp, 'favorites.json') };
}

test('failed writes reject, preserve committed state, and allow subsequent retries', async t => {
  const { file } = await temporaryStore(t);
  const store = createFavoritesStore(file);
  const original = await store.add(service);
  const other = { ...service, command: 'node other.js' };
  const rename = t.mock.method(fs, 'rename', async () => { throw Object.assign(new Error('read-only'), { code: 'EACCES' }); });
  await assert.rejects(store.add(other), { code: 'FAVORITES_WRITE_FAILED' });
  await assert.rejects(store.remove(original.favoriteId), { code: 'FAVORITES_WRITE_FAILED' });
  await assert.rejects(store.syncWithServices([{ ...service, port: 4000, ports: [4000] }]), { code: 'FAVORITES_WRITE_FAILED' });
  assert.deepEqual((await store.list()).map(f => [f.favoriteId, f.lastPort]), [[original.favoriteId, 3000]]);
  assert.equal((await createFavoritesStore(file).list()).length, 1);
  rename.mock.restore();
  await store.add(other);
  assert.equal((await store.list()).length, 2);
  assert.equal(await store.remove(original.favoriteId), true);
  assert.deepEqual((await createFavoritesStore(file).list()).map(f => f.command), ['node other.js']);
});

test('unavailable storage and invalid JSON fail explicitly without overwriting history', async t => {
  const { file } = await temporaryStore(t);
  await writeFile(file, 'not a directory');
  await assert.rejects(createFavoritesStore(path.join(file, 'favorites.json')).add(service), { code: 'FAVORITES_WRITE_FAILED' });
  await assert.rejects(createFavoritesStore(file).add(service), { code: 'FAVORITES_READ_FAILED' });
  assert.equal(await readFile(file, 'utf8'), 'not a directory');
});

test('initial concurrent reads and mutations retain old and new favorites', async t => {
  const { file } = await temporaryStore(t);
  await createFavoritesStore(file).add(service);
  const store = createFavoritesStore(file);
  const [first, second] = await Promise.all([store.list(), store.list(), store.add({ ...service, command: 'node new.js' })]);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal((await store.list()).length, 2);
  assert.equal((await createFavoritesStore(file).list()).length, 2);
});

test('independent stores merge additions and never resurrect another instance\'s deletion', async t => {
  const { file } = await temporaryStore(t);
  const a = createFavoritesStore(file), b = createFavoritesStore(file);
  await Promise.all([a.list(), b.list()]);
  const [favA, favB] = await Promise.all([
    a.add({ ...service, command: 'node a.js' }),
    b.add({ ...service, command: 'node b.js' }),
  ]);
  assert.equal((await a.list()).length, 2);
  await b.syncWithServices([{ ...service, command: 'node a.js' }]);
  await a.remove(favA.favoriteId);
  await b.syncWithServices([{ ...service, command: 'node a.js' }]);
  assert.deepEqual((await a.list()).map(f => f.favoriteId), [favB.favoriteId]);
});

test('different OS processes serialize read-modify-write transactions', async t => {
  const { file } = await temporaryStore(t);
  const favoritesUrl = new URL('../src/favorites.ts', import.meta.url).href;
  const fixturesUrl = new URL('./fixtures.ts', import.meta.url).href;
  const run = promisify(execFile);
  await Promise.all(Array.from({ length: 3 }, (_, worker) => run(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { createFavoritesStore } from ${JSON.stringify(favoritesUrl)};
    import { service } from ${JSON.stringify(fixturesUrl)};
    const store = createFavoritesStore(${JSON.stringify(file)});
    await store.list();
    for (let i = 0; i < 4; i++) await store.add({ ...service, command: 'node worker-${worker}-' + i + '.js' });
  `], { timeout: 15_000 })));
  const favorites = await createFavoritesStore(file).list();
  assert.equal(favorites.length, 12);
  assert.equal(new Set(favorites.map(f => f.command)).size, 12);
});

test('a stale lock left by an interrupted process is recoverable', async t => {
  const { file } = await temporaryStore(t);
  await mkdir(`${file}.lock`);
  const old = new Date(Date.now() - 60_000);
  await utimes(`${file}.lock`, old, old);
  await createFavoritesStore(file).add(service);
  assert.equal((await createFavoritesStore(file).list()).length, 1);
});

test('different entry points or reused ports cannot overwrite a favorite', async () => {
  const store = createFavoritesStore();
  const original = await store.add({ ...service, command: 'node api.js' });
  for (const replacement of [
    { ...service, command: 'node worker.js' },
    { ...service, command: 'python server.py', processName: 'python', framework: 'Flask' },
  ]) {
    const result = await store.syncWithServices([replacement]);
    assert.equal(result.services[0].favoriteId, undefined);
    assert.deepEqual(result.favorites[0].command, original.command);
    assert.equal(result.favorites[0].lastSeenAt, original.lastSeenAt);
  }
});

test('port changes match only when both service and favorite candidates are unique', async () => {
  const makeService = (port: number) => ({ ...service, id: `${port}:example`, port, ports: [port], command: `node api.js --port ${port}` });
  const store = createFavoritesStore();
  const fav = await store.add(makeService(3000));
  const ambiguous = await store.syncWithServices([makeService(3001), makeService(3002)]);
  assert.ok(ambiguous.services.every(s => !s.favoriteId));
  const exact = await store.syncWithServices([makeService(3000), makeService(3001)]);
  assert.equal(exact.services[0].favoriteId, fav.favoriteId);
  assert.equal(exact.services[1].favoriteId, undefined);
  await store.add(makeService(3001));
  assert.equal((await store.list()).length, 2, 'explicitly saved instances remain separate');
  assert.equal((await store.syncWithServices([makeService(3002)])).services[0].favoriteId, undefined);
});

test('updated command fingerprints remain matchable after port drift without creating duplicates', async () => {
  const store = createFavoritesStore();
  const original = { ...service, command: 'node api.js --port 3000' };
  const fav = await store.add(original);
  const restarted = { ...original, port: 3001, ports: [3001], command: 'node api.js --port 3001' };
  await store.syncWithServices([restarted]);
  assert.equal((await store.syncWithServices([restarted])).services[0].favoriteId, fav.favoriteId);
  assert.equal((await store.add(restarted)).favoriteId, fav.favoriteId);
  assert.equal((await store.list()).length, 1);
});

test('lastSeen is checkpointed, throttled, and flushed on observed exit; secondary ports also persist', async t => {
  const { file } = await temporaryStore(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const store = createFavoritesStore(file);
  await store.add(service);
  const disk = async () => (await createFavoritesStore(file).list())[0];
  now += 1000;
  await store.syncWithServices([service]);
  const checkpoint = now;
  assert.equal((await disk()).lastSeenAt, checkpoint);
  now += 1000;
  await store.syncWithServices([service]);
  assert.equal((await store.list())[0].lastSeenAt, now);
  assert.equal((await disk()).lastSeenAt, checkpoint, 'avoid writes on every poll');
  await store.syncWithServices([]);
  assert.equal((await disk()).lastSeenAt, now, 'flush the last observation on exit');
  await store.syncWithServices([service]);
  now += 60_000;
  await store.syncWithServices([service]);
  assert.equal((await disk()).lastSeenAt, now, 'persist even with unchanged command/name/port');
  await store.syncWithServices([{ ...service, ports: [3000, 4000] }]);
  assert.deepEqual((await disk()).lastPorts, [3000, 4000]);
});
