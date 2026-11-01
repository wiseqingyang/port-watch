import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const packageMetadata = JSON.parse(await readFile('package.json', 'utf8'));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'portwatch-package-'));
let child;
let busy;
try {
  console.log('Building and packing the actual npm artifact…');
  const { stdout } = await exec('npm', ['pack', '--json', '--pack-destination', temporary], { maxBuffer: 4 * 1024 * 1024, timeout: 120_000 });
  const [manifest] = JSON.parse(stdout.slice(stdout.search(/^\[\s*\{/m)));
  assert.ok(manifest.files.some(file => file.path === 'dist/cli.js'));
  assert.ok(manifest.files.some(file => file.path === 'dist/client/index.html'));
  for (const file of manifest.files) {
    assert.ok(/^(dist\/(cli\.js|client\/[^.].*)|package\.json|README(?:\.zh-CN)?\.md|LICENSE|CONTRIBUTING\.md)$/.test(file.path), `Unexpected npm file: ${file.path}`);
    assert.ok(!file.path.endsWith('.map') && !file.path.includes('.env') && !file.path.includes('tsbuildinfo'));
  }
  for (const asset of ['favicon.svg', 'brand/mark.svg', 'brand/logo-light.svg', 'brand/logo-dark.svg']) {
    assert.ok(manifest.files.some(file => file.path === `dist/client/${asset}`), `Missing brand asset: ${asset}`);
  }
  console.log('Checking npx with a fresh cache and isolated global prefix…');
  const tarball = path.join(temporary, manifest.filename);
  const npxOptions = {
    cwd: temporary,
    timeout: 120_000,
    env: { ...process.env, npm_config_prefix: path.join(temporary, 'npx-global') },
  };
  const npxArgs = ['--yes', '--cache', path.join(temporary, 'npx-cache'), '--registry=https://registry.npmjs.org', `file:${tarball}`];
  assert.equal((await exec('npx', [...npxArgs, '--version'], npxOptions)).stdout.trim(), packageMetadata.version);
  assert.match((await exec('npx', [...npxArgs, '--help'], npxOptions)).stdout, /Usage: port-watch/);
  const prefix = path.join(temporary, 'global');
  await exec('npm', ['install', '--global', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', path.join(temporary, manifest.filename)], { timeout: 120_000 });
  const installedRequire = createRequire(path.join(prefix, 'lib/node_modules', packageMetadata.name, 'package.json'));
  const expressRequire = createRequire(installedRequire.resolve('express'));
  const parserVersion = expressRequire('body-parser/package.json').version;
  const [major, minor] = parserVersion.split('.').map(Number);
  assert.ok(major > 2 || (major === 2 && minor >= 4), `Installed body-parser ${parserVersion} is vulnerable; refresh dependency resolution.`);
  const bin = path.join(prefix, 'bin', 'port-watch');
  const options = { cwd: temporary, timeout: 15_000 };
  assert.match((await exec(bin, ['--help'], options)).stdout, /Usage: port-watch/);
  assert.equal((await exec(bin, ['--version'], options)).stdout.trim(), packageMetadata.version);
  await assert.rejects(exec(bin, ['--host', '0.0.0.0', '--no-open'], options));
  await assert.rejects(exec(bin, ['--port', '123abc', '--no-open'], options));
  busy = net.createServer();
  busy.listen(0, '127.0.0.1');
  await once(busy, 'listening');
  const occupiedPort = busy.address().port;
  child = spawn(bin, ['--no-open', '--port', String(occupiedPort)], { cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, XDG_CONFIG_HOME: path.join(temporary, 'config') } });
  const sessionUrl = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Installed CLI did not start within 20 seconds.')), 20_000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Installed CLI exited before startup (${code}).`)); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s]*#token=[a-f\d]{64}/);
      if (match) { clearTimeout(timer); resolve(new URL(match[0])); }
    });
  });
  assert.notEqual(Number(sessionUrl.port), occupiedPort, 'Occupied ports must be retried with a real listen');
  const token = new URLSearchParams(sessionUrl.hash.slice(1)).get('token');
  const origin = sessionUrl.origin;
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /id="root"/);
  assert.ok(!html.includes(token), 'Token must never be embedded in unauthenticated HTML');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)];
  assert.ok(assets.length >= 2);
  for (const [, asset] of assets) assert.equal((await fetch(origin + asset)).status, 200);
  assert.equal((await fetch(origin + '/api/services')).status, 401);
  const headers = { Authorization: `Bearer ${token}` };
  const services = await fetch(origin + '/api/services', { headers });
  assert.equal(services.status, 200);
  const data = await services.json();
  const own = data.services.find(service => service.pid === child.pid);
  assert.ok(own?.protectedReason, 'The dashboard must appear as protected in a real OS scan');
  assert.equal((await fetch(origin + '/api/services/kill', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceId: own.id }) })).status, 403);
  assert.equal((await fetch(origin + '/api/services/restart', { method: 'POST', headers })).status, 404);
  console.log(`Package smoke test passed: ${manifest.files.length} packaged files; npx, globally installed CLI, port fallback, dashboard assets, authenticated scan, and self-protection verified.`);
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(timer);
  }
  if (busy) await new Promise(resolve => busy.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
