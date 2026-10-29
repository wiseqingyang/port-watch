import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanRunningServices } from '../src/scanner.js';
import { killProcess } from '../src/process-manager.js';
import { runSystemCommand } from '../src/system.js';

async function dispose(child: ReturnType<typeof spawn>) {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  }
}

test('real scanner identifies project, redacts credentials, and stops a dedicated listener', { skip: process.geteuid?.() === 0, timeout: 20_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'portwatch-scanner-'));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'scanner-fixture', version: '1.0.0' }));
    await mkdir(path.join(directory, 'nested'));
    const source = "require('node:net').createServer().listen(0,'127.0.0.1',function(){console.log('ready')});";
    child = spawn(process.execPath, ['-e', source, '--', '--token', 'scanner-fixture-secret'], { cwd: path.join(directory, 'nested'), stdio: ['ignore', 'pipe', 'pipe'] });
    await once(child.stdout!, 'data');
    const result = await scanRunningServices();
    const fixture = result.services.find(service => service.pid === child!.pid);
    assert.ok(fixture);
    assert.equal(fixture.project?.name, 'scanner-fixture');
    assert.equal(fixture.user, os.userInfo().username);
    assert.equal(fixture.commandRedacted, true);
    assert.ok(!fixture.command.includes('scanner-fixture-secret'));
    const stopped = await killProcess(fixture);
    assert.equal(stopped.success, true);
  } finally { if (child) await dispose(child); await rm(directory, { recursive: true, force: true }); }
});

test('missing system tools fail explicitly instead of returning an empty dashboard', async () => {
  await assert.rejects(runSystemCommand('portwatch-nonexistent-tool', []), { code: 'MISSING_TOOL' });
});
