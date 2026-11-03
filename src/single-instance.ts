import { createHash } from 'node:crypto';
import { lstat, mkdir, unlink } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import lockfile from 'proper-lockfile';

export function defaultInstanceDirectory(homeDirectory = homedir()): string {
  // Keep Unix socket paths short, stable across working directories, npx caches,
  // dashboard ports, and TMPDIR/XDG_CONFIG_HOME settings. HOME allows isolated tests.
  const home = createHash('sha256').update(homeDirectory).digest('hex').slice(0, 16);
  return `/tmp/port-watch-${process.getuid!()}-${home}`;
}

type Instance = { acquired: true; release: () => Promise<void> }
  | { acquired: false; pid?: number };

async function probe(socketPath: string): Promise<{ pid?: number } | undefined> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let connected = false;
    let data = '';
    const finish = (value: { pid?: number } | undefined, error?: Error) => {
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
      if (data.length > 32) finish({});
      else if (data.includes('\n')) finish(/^\d+\n$/.test(data) ? { pid: Number(data.trim()) } : {});
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
  const server = createServer(socket => {
    socket.on('error', () => {});
    socket.setTimeout(1000, () => socket.destroy());
    socket.end(`${process.pid}\n`);
  });
  const release = () => new Promise<void>((resolve, reject) => {
    if (!server.listening) { resolve(); return; }
    server.close(error => error ? reject(error) : resolve());
  });
  try {
    const existing = await probe(socketPath);
    if (existing) return { acquired: false, ...existing };
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
    return { acquired: true, release };
  } finally {
    try { await unlock(); }
    catch (error) { await release(); throw error; }
  }
}
