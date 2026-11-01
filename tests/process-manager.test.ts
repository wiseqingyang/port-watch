import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { killProcess, revealInFileManager, openInTerminal, type ProcessControl } from '../src/process-manager.js';
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
    if (process.platform === 'darwin') {
      await openInTerminal(directory);
      assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), ['-a', 'Terminal', directory]);
    }
    await assert.rejects(readFile('INJECTED'), { code: 'ENOENT' });
    await assert.rejects(revealInFileManager(path.join(tmp, 'missing')), { code: 'DIRECTORY_UNAVAILABLE' });
    await assert.rejects(openInTerminal(path.join(tmp, 'missing')), { code: 'DIRECTORY_UNAVAILABLE' });
  } finally { process.env.PATH = oldPath; await rm(tmp, { recursive: true, force: true }); }
});

test('Linux terminal launch returns promptly and leaves the terminal alive beyond five seconds', { timeout: 15_000 }, async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'portwatch-terminal-'));
  const oldPath = process.env.PATH;
  let pid: number | undefined;
  try {
    const directory = path.join(tmp, 'folder $(literal) with spaces');
    await mkdir(directory);
    const output = path.join(tmp, 'started.json');
    // The first candidate fails immediately; exercise fallback without opening a real GUI.
    await writeFile(path.join(tmp, 'x-terminal-emulator'), `#!${process.execPath}\nprocess.exit(1);\n`, { mode: 0o755 });
    await writeFile(path.join(tmp, 'gnome-terminal'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify({ pid: process.pid, cwd: process.cwd(), args: process.argv.slice(2) }));\nsetInterval(() => {}, 1000);\n`, { mode: 0o755 });
    process.env.PATH = tmp;
    const start = Date.now();
    await openInTerminal(directory, 'linux');
    const elapsed = Date.now() - start;
    let details: { pid: number; cwd: string; args: string[] } | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      details = await readFile(output, 'utf8').then(raw => JSON.parse(raw)).catch(() => undefined);
      if (details) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(details);
    pid = details.pid;
    assert.ok(elapsed < 2000, 'must not wait for the terminal to exit');
    assert.equal(details.cwd, await fs.realpath(directory));
    assert.deepEqual(details.args, [`--working-directory=${directory}`]);
    await new Promise(resolve => setTimeout(resolve, 5200));
    assert.doesNotThrow(() => process.kill(pid!, 0), 'terminal must survive the old timeout');
    await rm(path.join(tmp, 'gnome-terminal'));
    await rm(path.join(tmp, 'x-terminal-emulator'));
    await assert.rejects(openInTerminal(directory, 'linux'), { code: 'TERMINAL_FAILED' });
  } finally {
    process.env.PATH = oldPath;
    if (pid) { try { process.kill(pid, 'SIGTERM'); } catch { /* already exited */ } }
    await rm(tmp, { recursive: true, force: true });
  }
});
