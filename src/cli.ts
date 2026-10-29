import { Command, InvalidArgumentError } from 'commander';
import { createServer as createHttpServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import openBrowser from 'open';
import { createServer } from './server.js';
import { checkSystemSupport } from './system.js';

const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

export function parsePort(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new InvalidArgumentError('Port must be an integer between 1 and 65535.');
  return Number(value);
}

async function listen(server: Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => { server.off('listening', onReady); reject(error); };
    const onReady = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onReady);
    server.listen(port, host);
  });
}

export async function runCli(): Promise<void> {
  const defaultLocale = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const program = new Command().name('port-watch').description('Local TCP service dashboard for macOS and Linux').version(version)
    .option('-p, --port <number>', 'Dashboard port; tries up to 100 subsequent ports if occupied', parsePort, 4999)
    .option('--host <address>', 'Loopback address: 127.0.0.1 or ::1', '127.0.0.1')
    .option('-l, --lang <locale>', 'UI language: zh or en')
    .option('--no-open', 'Do not open the browser automatically')
    .option('--dev', 'Use the local Vite dashboard at 127.0.0.1:5175 (development only)');
  program.parse(process.argv);
  const options = program.opts();
  if (!['127.0.0.1', '::1'].includes(options.host)) program.error('Only loopback addresses 127.0.0.1 and ::1 are supported.');
  if (options.lang && !['zh', 'en'].includes(options.lang)) program.error('--lang must be zh or en.');
  if (options.dev && (options.host !== '127.0.0.1' || options.port !== 4999)) program.error('Development mode requires 127.0.0.1:4999 for the Vite proxy.');
  await checkSystemSupport();
  const token = randomBytes(32).toString('hex');
  const devOrigin = options.dev ? 'http://127.0.0.1:5175' : undefined;
  const app = createServer({ token, host: options.host, devOrigin });
  const server = createHttpServer(app);
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  let port = options.port as number;
  const lastPort = options.dev ? port : Math.min(65535, port + 100);
  while (true) {
    try { await listen(server, port, options.host); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || port === lastPort) throw error;
      port++;
    }
  }
  server.on('error', error => { console.error('PortWatch:', error.message); process.exitCode = 1; server.close(); });
  const locale = options.lang || defaultLocale;
  const origin = devOrigin ?? `http://${options.host === '::1' ? '[::1]' : options.host}:${port}`;
  const url = `${origin}/${options.lang ? `?lang=${locale}` : ''}#token=${token}`;
  console.log(`\n  PortWatch ${version}\n\n  ${locale === 'zh' ? '打开此会话链接（请勿分享）：' : 'Open this private session URL (do not share):'}\n  ${url}\n\n  ${locale === 'zh' ? '按 Ctrl+C 退出' : 'Press Ctrl+C to stop'}\n`);
  let closing = false;
  const exit = () => {
    if (closing) return;
    closing = true;
    server.close(() => { process.exitCode = 0; });
    server.closeAllConnections();
  };
  process.once('SIGINT', exit);
  process.once('SIGTERM', exit);
  if (options.open !== false) await openBrowser(url).catch(() => {});
}
