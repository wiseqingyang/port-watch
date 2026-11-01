import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFavoritesStore } from '../src/favorites.js';
import { service } from './fixtures.js';

test('CLI still opens the favorites dashboard when scanning tools are missing', { timeout: 20_000 }, async t => {
  const config = await mkdtemp(path.join(os.tmpdir(), 'portwatch-cli-favorites-'));
  const fav = await createFavoritesStore(path.join(config, 'port-watch', 'favorites.json')).add(service);
  const reservation = createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/bin.ts', '--no-open', '--lang', 'en', '--port', String(port)], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PATH: '', XDG_CONFIG_HOME: config }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      await stopped;
      clearTimeout(timer);
    }
    await rm(config, { recursive: true, force: true });
  });
  const url = await new Promise<URL>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('CLI did not start')), 10_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('CLI exited before opening the dashboard')); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s]*#token=[a-f\d]{64}/);
      if (match) { clearTimeout(timer); resolve(new URL(match[0])); }
    });
  });
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  const headers = { Authorization: `Bearer ${token}` };
  const saved = await fetch(url.origin + '/api/favorites', { headers });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).favorites[0].favoriteId, fav.favoriteId);
  const scan = await fetch(url.origin + '/api/services', { headers });
  assert.equal(scan.status, 503);
  assert.equal((await scan.json()).code, 'MISSING_TOOL');
  assert.match(stderr, /saved favorites are still accessible/);
});
