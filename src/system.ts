import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 500) {
    super(message);
  }
}

/** Fixed executable + argument array only; never invoke a shell. */
export async function runSystemCommand(file: string, args: string[], allowNoMatches = false): Promise<string> {
  try {
    return (await execFileAsync(file, args, {
      encoding: 'utf8', timeout: 5000, maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    })).stdout;
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
    // lsof/ps use exit 1 for an empty selection (including processes exiting mid-scan).
    if (allowNoMatches && Number(e.code) === 1 && !e.stderr?.trim()) return e.stdout || '';
    if (e.code === 'ENOENT') throw new AppError('MISSING_TOOL', `Required tool '${file}' was not found. Install lsof and procps (ps) on Linux.`, 503);
    throw new AppError('SCAN_FAILED', `Could not run ${file}${e.killed ? ' within 5 seconds' : ''}. Check permissions and tool availability.`, 503);
  }
}

export async function checkSystemSupport(): Promise<void> {
  if (!['darwin', 'linux'].includes(process.platform)) {
    throw new AppError('UNSUPPORTED_PLATFORM', 'PortWatch supports macOS and Linux only.', 503);
  }
  await runSystemCommand('lsof', ['-v']);
  await runSystemCommand('ps', ['-p', String(process.pid), '-o', 'pid=']);
}
