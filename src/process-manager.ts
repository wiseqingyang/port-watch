import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readProcesses, processIdentity, protectedReason, type ProcessInfo } from './process-inspector.js';
import { AppError } from './system.js';
import type { KillResult, PortService } from './types.js';

const execFileAsync = promisify(execFile);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface ProcessControl {
  read(pid: number): Promise<ProcessInfo | undefined>;
  signal(pid: number, signal: NodeJS.Signals): void;
  wait(ms: number): Promise<unknown>;
}
const systemControl: ProcessControl = {
  read: async pid => (await readProcesses([pid])).get(pid),
  signal: (pid, signal) => { process.kill(pid, signal); },
  wait: sleep,
};

/** Stop exactly the selected process. Never escalate or signal an unowned process group. */
export async function killProcess(service: PortService, force = false, control: ProcessControl = systemControl): Promise<KillResult> {
  const { pid, id } = service;
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new AppError('BAD_REQUEST', 'Invalid process ID.', 400);
  const current = await control.read(pid);
  if (!current || current.state.startsWith('Z')) return { pid, success: true, code: 'ALREADY_EXITED' };
  if (processIdentity(current) !== id) throw new AppError('STALE_PROCESS', 'The process has changed. Refresh before trying again.', 409);
  if (protectedReason(current, service.processName)) throw new AppError('PROTECTED_PROCESS', 'This process cannot be stopped by PortWatch.', 403);
  try {
    control.signal(pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return { pid, success: true, code: 'ALREADY_EXITED' };
    if (code === 'EPERM') throw new AppError('PERMISSION_DENIED', 'Permission denied while signalling the process.', 403);
    throw new AppError('STOP_FAILED', 'Could not signal the process.');
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    await control.wait(150);
    const next = await control.read(pid);
    if (!next || next.state.startsWith('Z') || processIdentity(next) !== id) return { pid, success: true, code: 'STOPPED' };
  }
  return { pid, success: false, code: 'STILL_RUNNING' };
}

export async function revealInFileManager(targetPath: string): Promise<void> {
  if (!path.isAbsolute(targetPath) || targetPath.includes('\0')) throw new AppError('BAD_REQUEST', 'An absolute directory path is required.', 400);
  if (!(await fs.stat(targetPath).catch(() => null))?.isDirectory()) throw new AppError('DIRECTORY_UNAVAILABLE', 'The directory no longer exists or is inaccessible.', 409);
  const executable = process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    await execFileAsync(executable, [targetPath], { timeout: 5000 });
  } catch {
    throw new AppError('REVEAL_FAILED', 'Could not open the directory. A graphical desktop and a file manager are required.');
  }
}
