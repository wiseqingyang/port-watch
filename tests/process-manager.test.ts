import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { killProcess, revealInFileManager, type ProcessControl } from '../src/process-manager.js';
import { processIdentity, protectedReason, parseProcessInfo, readProcesses } from '../src/process-inspector.js';
import { info, service } from './fixtures.js';

const canStop = process.geteuid?.() !== 0;
test('stop never escalates automatically; force requires an explicit separate call', { skip: !canStop }, async () => {
  const signals: string[] = [];
  const control: ProcessControl = { read: async () => info, signal: (_pid, signal) => { signals.push(signal); }, wait: async () => {} };
  assert.equal((await killProcess(service, false, control)).code, 'STILL_RUNNING');
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal((await killProcess(service, true, control)).code, 'STILL_RUNNING');
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('stale process identity and protected process checks run before signals', async () => {
  const control: ProcessControl = { read: async () => ({ ...info, startedAt: 'different' }), signal: () => assert.fail('must not signal'), wait: async () => {} };
  await assert.rejects(killProcess(service, false, control), { code: 'STALE_PROCESS' });
  const root = { ...info, uid: 0 };
  control.read = async () => root;
  await assert.rejects(killProcess({ ...service, id: processIdentity(root) }, false, control), { code: 'PROTECTED_PROCESS' });
  assert.equal(protectedReason({ ...info, command: '/System/Library/CoreServices/ControlCenter.app/Contents/MacOS/ControlCenter' }), 'SYSTEM_PROCESS');
});

test('EPERM is a failure, ESRCH is an exited process, PID reuse is not signalled again', { skip: !canStop }, async () => {
  const control: ProcessControl = { read: async () => info, signal: () => { throw Object.assign(new Error('permission denied'), { code: 'EPERM' }); }, wait: async () => {} };
  await assert.rejects(killProcess(service, false, control), { code: 'PERMISSION_DENIED' });
  control.signal = () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); };
  assert.equal((await killProcess(service, false, control)).code, 'ALREADY_EXITED');
  let reads = 0; let signals = 0;
  control.read = async () => (++reads === 1 ? info : { ...info, startedAt: 'new process' });
  control.signal = () => { signals++; };
  assert.equal((await killProcess(service, false, control)).code, 'STOPPED'); assert.equal(signals, 1);
});

test('ps parser preserves owner/start time and supports a real process', async () => {
  const parsed = parseProcessInfo('12345 2 501 developer 0.5 1024 01:03 Thu Oct 29 12:00:00 2026 S node server.js');
  assert.equal(parsed.get(12345)?.uid, 501);
  assert.equal(parsed.get(12345)?.startedAt, info.startedAt);
  const own = (await readProcesses([process.pid])).get(process.pid);
  assert.equal(own?.pid, process.pid); assert.equal(own?.uid, process.geteuid?.());
});

test('file-manager paths are passed literally, including shell syntax and spaces', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'portwatch-reveal-'));
  const oldPath = process.env.PATH;
  try {
    const directory = path.join(tmp, 'folder $(touch INJECTED) with spaces');
    await mkdir(directory);
    const output = path.join(tmp, 'args.json');
    const tool = process.platform === 'darwin' ? 'open' : 'xdg-open';
    await writeFile(path.join(tmp, tool), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
    process.env.PATH = `${tmp}:${oldPath}`;
    await revealInFileManager(directory);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), [directory]);
    await assert.rejects(readFile('INJECTED'), { code: 'ENOENT' });
    await assert.rejects(revealInFileManager(path.join(tmp, 'missing')), { code: 'DIRECTORY_UNAVAILABLE' });
  } finally { process.env.PATH = oldPath; await rm(tmp, { recursive: true, force: true }); }
});
