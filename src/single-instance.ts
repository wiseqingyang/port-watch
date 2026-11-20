import { createHash } from 'node:crypto';
import { lstat, mkdir, unlink } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import lockfile from 'proper-lockfile';

export function defaultInstanceDirectory(homeDirectory = homedir()): string {
  // Keep Unix socket paths short, stable across working directories, npx caches,
  // dashboard ports, and TMPDIR/XDG_CONFIG_HOME settings. HOME allows isolated tests.
  const home = createHash('sha256').update(homeDirectory).digest('hex').slice(0, 16);
  return `/tmp/port-watch-${process.getuid!()}-${home}`;
}

type RunningInstance = { pid?: number; url?: string; starting?: boolean };
type Instance = { acquired: true; setSessionUrl: (url: string) => void; release: () => Promise<void> }
  | ({ acquired: false } & RunningInstance);

function parseReply(data: string): RunningInstance {
  // Older instances reply with just a PID. Only open URLs in the format our CLI generates.
  const match = /^(\d+)(?: (\S+))?\n$/.exec(data);
  if (!match) return {};
  const pid = Number(match[1]);
  const value = match[2];
  if (value === 'starting') return { pid, starting: true };
  const sessionUrl = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):\d{1,5}\/(?:\?lang=(?:en|zh))?#token=[a-f\d]{64}$/;
  if (value && sessionUrl.test(value)) return { pid, url: value };
  return { pid };
}

async function probe(socketPath: string): Promise<RunningInstance | undefined> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let connected = false;
    let data = '';
    const finish = (value: RunningInstance | undefined, error?: Error) => {
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    // A connected but unresponsive process still owns its instance. Never reclaim
    // its socket just because its event loop is busy or suspended.
    const timer = setTimeout(() => finish({}, connected ? undefined : new Error('Timed out checking the running PortWatch instance.')), 1000);
    socket.once('connect', () => { connected = true; });
    socket.on('data', chunk => {
      data += chunk.toString();
      if (data.length > 256) finish({});
      else if (data.includes('\n')) finish(parseReply(data));
    });
    socket.once('end', () => finish({}));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (connected) finish({});
      else if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') finish(undefined);
      else finish(undefined, error);
    });
  });
}

export async function acquireInstance(directory = defaultInstanceDirectory()): Promise<Instance> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.uid !== process.getuid!() || (stat.mode & 0o077) !== 0) {
    throw new Error(`PortWatch instance directory must be owned by you and private: ${directory}`);
  }
  const socketPath = path.join(directory, 'instance.sock');
  // Serialize stale-socket removal and binding. Without this short-lived lock,
  // concurrent launches could unlink a socket another launch has just acquired.
  const unlock = await lockfile.lock(socketPath, {
    realpath: false,
    stale: 5000,
    retries: { retries: 70, factor: 1, minTimeout: 100, maxTimeout: 100 },
  });
  let sessionUrl: string | undefined;
  const server = createServer(socket => {
    socket.on('error', () => {});
    socket.setTimeout(1000, () => socket.destroy());
    socket.end(`${process.pid} ${sessionUrl ?? 'starting'}\n`);
  });
  const release = () => new Promise<void>((resolve, reject) => {
    if (!server.listening) { resolve(); return; }
    server.close(error => error ? reject(error) : resolve());
  });
  try {
    const existing = await probe(socketPath);
    // Returning the promise lets finally release the lock before this wait finishes.
    if (existing) return waitForSession(existing, socketPath);
    await unlink(socketPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, () => { server.off('error', reject); resolve(); });
    });
    // The dashboard owns process lifetime. Normal shutdown explicitly releases
    // this socket; abnormal exits are recovered on the next launch.
    server.unref();
    return { acquired: true, setSessionUrl(url) { sessionUrl = url; }, release };
  } finally {
    try { await unlock(); }
    catch (error) { await release(); throw error; }
  }
}

async function waitForSession(owner: RunningInstance, socketPath: string): Promise<Instance> {
  const deadline = Date.now() + 12_000;
  while (owner.starting && Date.now() < deadline) {
    await delay(100);
    const next = await probe(socketPath);
    if (!next) return acquireInstance(path.dirname(socketPath));
    owner = next;
  }
  return { acquired: false, ...owner };
}
