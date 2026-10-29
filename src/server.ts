import express, { type Express, type ErrorRequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanRunningServices } from './scanner.js';
import { killProcess, revealInFileManager } from './process-manager.js';
import { AppError } from './system.js';
import type { ServicesResponse, PortService } from './types.js';

export function bundledClientDirectory(): string {
  return fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? '../dist/client/' : './client/', import.meta.url));
}

interface ServerOptions {
  token: string;
  host: '127.0.0.1' | '::1';
  devOrigin?: string;
  scan?: typeof scanRunningServices;
  stop?: typeof killProcess;
  reveal?: typeof revealInFileManager;
  clientDir?: string;
}

export function createServer(options: ServerOptions): Express {
  if (!/^[a-f\d]{64}$/.test(options.token)) throw new Error('A 256-bit session token is required.');
  const app = express();
  app.disable('x-powered-by');
  const scan = options.scan ?? scanRunningServices;
  let cached: { data: ServicesResponse; expires: number } | undefined;
  let scanning: Promise<ServicesResponse> | undefined;
  async function snapshot(fresh = false): Promise<ServicesResponse> {
    if (!fresh && cached && cached.expires > Date.now()) return cached.data;
    if (!scanning) {
      scanning = scan().then(data => { cached = { data, expires: Date.now() + 1000 }; return data; })
        .finally(() => { scanning = undefined; });
    }
    return scanning;
  }
  async function selectedService(value: unknown): Promise<PortService> {
    if (typeof value !== 'string' || !/^\d+:[a-f\d]{24}$/.test(value)) throw new AppError('BAD_REQUEST', 'A valid serviceId is required.', 400);
    const service = (await snapshot(true)).services.find(item => item.id === value);
    if (!service) throw new AppError('STALE_PROCESS', 'This service has exited or changed. Refresh the list.', 409);
    return service;
  }

  app.use((req, res, next) => {
    const authority = `${options.host === '::1' ? '[::1]' : options.host}:${req.socket.localPort}`;
    if (req.headers.host !== authority) { res.status(403).json({ code: 'INVALID_HOST', error: 'Untrusted host.' }); return; }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${authority}` && origin !== options.devOrigin) { res.status(403).json({ code: 'INVALID_ORIGIN', error: 'Untrusted origin.' }); return; }
    if (req.headers['sec-fetch-site'] === 'cross-site') { res.status(403).json({ code: 'INVALID_ORIGIN', error: 'Cross-site requests are not allowed.' }); return; }
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    next();
  });
  app.use('/api', (req, res, next) => {
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${options.token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { res.status(401).json({ code: 'UNAUTHORIZED', error: 'Open the session URL printed by PortWatch in your terminal.' }); return; }
    next();
  }, express.json({ limit: '16kb', inflate: false }));

  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/api/services', async (_req, res) => { res.json(await snapshot()); });
  const stopping = new Set<string>();
  app.post('/api/services/kill', async (req, res) => {
    const { serviceId, force = false } = req.body || {};
    if (typeof force !== 'boolean') throw new AppError('BAD_REQUEST', 'force must be a boolean.', 400);
    const service = await selectedService(serviceId);
    if (service.protectedReason) throw new AppError('PROTECTED_PROCESS', 'This process is protected.', 403);
    if (stopping.has(service.id)) throw new AppError('ACTION_IN_PROGRESS', 'A stop operation is already in progress.', 409);
    stopping.add(service.id);
    try { res.json(await (options.stop ?? killProcess)(service, force)); }
    finally { stopping.delete(service.id); cached = undefined; }
  });
  app.post('/api/services/reveal', async (req, res) => {
    const targetPath = req.body?.targetPath;
    if (typeof targetPath !== 'string' || !path.isAbsolute(targetPath) || targetPath.includes('\0')) throw new AppError('BAD_REQUEST', 'An absolute directory path is required.', 400);
    const normalized = path.normalize(targetPath);
    const allowed = (await snapshot(true)).services.some(service => {
      if (!service.cwd) return false;
      const relative = path.relative(normalized, service.cwd);
      return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
    });
    if (!allowed) throw new AppError('DIRECTORY_UNAVAILABLE', 'Only directories in the current service tree may be opened.', 403);
    await (options.reveal ?? revealInFileManager)(normalized);
    res.json({ success: true });
  });
  // The former restart and batch-kill routes are intentionally unavailable.
  app.use('/api', (_req, res) => { res.status(404).json({ code: 'NOT_FOUND', error: 'Unknown API endpoint.' }); });
  const clientDir = options.clientDir ?? bundledClientDirectory();
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.get('/', (_req, res) => { res.sendFile(path.join(clientDir, 'index.html')); });
  } else {
    app.get('/', (_req, res) => { res.status(503).type('text').send('Dashboard assets are missing. Run pnpm build, or use the Vite URL printed by pnpm dev.'); });
  }
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof AppError) { res.status(error.status).json({ code: error.code, error: error.message }); return; }
    const status = typeof error?.status === 'number' && error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).json({ code: status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR', error: status < 500 ? 'Invalid request body.' : 'The operation failed.' });
  };
  app.use(errors);
  return app;
}
