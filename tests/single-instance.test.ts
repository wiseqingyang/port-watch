import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { acquireInstance, defaultInstanceDirectory } from '../src/single-instance.js';

const bin = fileURLToPath(new URL('../src/bin.ts', import.meta.url));
const tsx = import.meta.resolve('tsx');

function launch(home: string, args: string[] = [], cwd = home) {
  const child = spawn(process.execPath, ['--import', tsx, bin, '--no-open', '--lang', 'en', ...args], {
    cwd, env: { ...process.env, HOME: home, PATH: '', XDG_CONFIG_HOME: cwd },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { errors += chunk; });
  const exited = once(child, 'exit');
  const ready = new Promise<'started' | 'exited'>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CLI timed out: ${output} ${errors}`)), 12_000);
    child.stdout.on('data', () => {
      if (output.includes('#token=')) { clearTimeout(timer); resolve('started'); }
    });
    child.once('exit', () => { clearTimeout(timer); resolve('exited'); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  return { child, ready, exited, output: () => output, errors: () => errors };
}

async function stop(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill(signal);
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(timer);
}

test('simultaneous CLI launches share one instance across directories, ports and configs; exits and crashes recover', { timeout: 30_000 }, async t => {
  const home = await mkdtemp('/tmp/pw-instance-test-');
  const other = `${home}/project`;
  await mkdir(other);
  const directory = defaultInstanceDirectory(home);
  const runs: ReturnType<typeof launch>[] = [];
  const run = (args: string[] = [], cwd?: string) => {
    const instance = launch(home, args, cwd);
    runs.push(instance);
    return instance;
  };
  t.after(async () => {
    for (const instance of runs) await stop(instance.child);
    await rm(home, { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  });
  const first = [run(), run(['--port', '5100'], other), run(['--port', '5200']), run(['--port', '5300'], other)];
  const states = await Promise.all(first.map(instance => instance.ready));
  assert.equal(states.filter(state => state === 'started').length, 1);
  const winner = first[states.indexOf('started')];
  for (const instance of first.filter(instance => instance !== winner)) {
    await instance.exited;
    assert.equal(instance.child.exitCode, 0, instance.errors());
    assert.match(instance.output(), new RegExp(`already running \\(PID: ${winner.child.pid}\\)`));
    assert.doesNotMatch(instance.output(), /#token=/);
    assert.equal(instance.errors(), '', 'Duplicates should exit before scanning');
  }
  const help = run(['--help']);
  assert.equal(await help.ready, 'exited');
  assert.equal(help.child.exitCode, 0);
  assert.match(help.output(), /Usage: port-watch/);
  const chinese = run(['--lang', 'zh', '--dev']);
  assert.equal(await chinese.ready, 'exited');
  assert.match(chinese.output(), /已在运行/);

  // A paused owner cannot reply with its PID, but still must not lose ownership.
  winner.child.kill('SIGSTOP');
  try {
    const pausedDuplicate = run();
    assert.equal(await pausedDuplicate.ready, 'exited');
    assert.equal(pausedDuplicate.child.exitCode, 0);
    assert.match(pausedDuplicate.output(), /already running/);
  } finally { winner.child.kill('SIGCONT'); }
  await stop(winner.child, 'SIGINT');
  const restart = run();
  assert.equal(await restart.ready, 'started', restart.errors());
  await stop(restart.child, 'SIGKILL');
  const crashRestarts = [run(), run(), run()];
  const crashStates = await Promise.all(crashRestarts.map(instance => instance.ready));
  assert.equal(crashStates.filter(state => state === 'started').length, 1);
  for (const instance of crashRestarts) {
    if (instance.child.exitCode !== null) assert.equal(instance.child.exitCode, 0, instance.errors());
    await stop(instance.child);
  }

  const busy = createServer().listen(0, '127.0.0.1');
  await once(busy, 'listening');
  t.after(() => { busy.close(); });
  const port = (busy.address() as { port: number }).port;
  const failed = run(['--dev', '--port', String(port)]);
  assert.equal(await failed.ready, 'exited');
  assert.equal(failed.child.exitCode, 1);
  assert.match(failed.errors(), /EADDRINUSE/);
  const afterFailure = run();
  assert.equal(await afterFailure.ready, 'started', afterFailure.errors());
});

test('recovers an abandoned startup mutex and serializes contenders', async t => {
  const directory = await mkdtemp('/tmp/pw-lock-test-');
  const owners: (() => Promise<void>)[] = [];
  t.after(async () => {
    for (const release of owners) await release();
    await rm(directory, { recursive: true, force: true });
  });
  const { utimes } = await import('node:fs/promises');
  const lock = `${directory}/instance.sock.lock`;
  await mkdir(lock);
  const old = new Date(Date.now() - 20_000);
  await utimes(lock, old, old);
  const results = await Promise.all(Array.from({ length: 4 }, () => acquireInstance(directory)));
  for (const instance of results) if (instance.acquired) owners.push(instance.release);
  assert.equal(results.filter(instance => instance.acquired).length, 1);
  for (const instance of results) if (!instance.acquired) assert.equal(instance.pid, process.pid);
});
