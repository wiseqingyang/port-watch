import { createHash, randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { matchFavorites } from './favorite-matching.js';
import { AppError } from './system.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FavoriteService, PortService, ServiceCategory } from './types.js';

const VALID_CATEGORIES = new Set<ServiceCategory>([
  'frontend',
  'backend',
  'ai_agent',
  'database',
  'dev_tools',
  'proxy_tunnel',
  'system',
]);

export function defaultFavoritesFile(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const baseDir = xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), '.config');
  return path.join(baseDir, 'port-watch', 'favorites.json');
}

export function computeFavoriteId(input: {
  cwd: string | null;
  processName: string;
  framework: string;
  command: string;
}): string {
  const key = `${input.cwd || ''}::${input.processName}::${input.framework}::${input.command}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 24);
}

function isValidFavoriteRecord(item: unknown): item is FavoriteService {
  if (!item || typeof item !== 'object') return false;
  const rec = item as Record<string, unknown>;
  return (
    typeof rec.favoriteId === 'string' &&
    /^[a-f\d]{24}$/.test(rec.favoriteId) &&
    typeof rec.createdAt === 'number' &&
    typeof rec.lastSeenAt === 'number' &&
    (rec.cwd === null || typeof rec.cwd === 'string') &&
    typeof rec.processName === 'string' &&
    typeof rec.command === 'string' &&
    typeof rec.commandRedacted === 'boolean' &&
    typeof rec.category === 'string' &&
    VALID_CATEGORIES.has(rec.category as ServiceCategory) &&
    typeof rec.framework === 'string' &&
    typeof rec.displayName === 'string' &&
    typeof rec.isDevOrAgent === 'boolean' &&
    typeof rec.lastPort === 'number' &&
    Array.isArray(rec.lastPorts)
  );
}

async function checkDirectoryExists(cwd: string | null): Promise<boolean> {
  if (!cwd || !path.isAbsolute(cwd)) return false;
  try {
    const stat = await fs.stat(cwd);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export interface FavoritesStore {
  list(): Promise<FavoriteService[]>;
  syncWithServices(services: PortService[], observedAt?: number): Promise<{
    services: PortService[];
    favorites: FavoriteService[];
  }>;
  add(service: PortService): Promise<FavoriteService>;
  remove(favoriteId: string): Promise<boolean>;
}

const LAST_SEEN_SAVE_INTERVAL = 60_000;

export function createFavoritesStore(filePath?: string): FavoritesStore {
  let items: FavoriteService[] = [];
  let operationChain: Promise<unknown> = Promise.resolve();
  let observed = new Map<string, { createdAt: number; time: number }>();

  async function read(file: string): Promise<FavoriteService[]> {
    let raw: string;
    try { raw = await fs.readFile(file, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new AppError('FAVORITES_READ_FAILED', 'Could not read the favorites file.');
    }
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed?.version === 1 ? parsed.favorites : undefined;
      if (!Array.isArray(list) || !list.every(isValidFavoriteRecord)) throw new Error('Invalid favorites');
      return list;
    } catch {
      // Never replace unreadable/corrupt history with an empty collection.
      throw new AppError('FAVORITES_READ_FAILED', 'The favorites file is invalid or uses an unsupported version.');
    }
  }

  async function persist(file: string, next: FavoriteService[], checkLock: () => void): Promise<void> {
    const tmpFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(tmpFile, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify({ version: 1, favorites: next }, null, 2), 'utf8');
        await handle.sync();
      } finally { await handle.close(); }
      checkLock();
      await fs.rename(tmpFile, file);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('FAVORITES_WRITE_FAILED', 'Could not save favorites. No changes were committed.');
    } finally { await fs.rm(tmpFile, { force: true }).catch(() => {}); }
  }

  // Serialize whole operations, including their initial read. File-backed stores always
  // re-read inside the inter-process lock, so another instance's edits are never lost.
  function transact<T>(operation: (draft: FavoriteService[], save: () => Promise<void>) => Promise<T>): Promise<T> {
    const run = async () => {
      let file: string | undefined;
      let release: (() => Promise<void>) | undefined;
      let compromised = false;
      const checkLock = () => {
        if (compromised) throw new AppError('FAVORITES_BUSY', 'The favorites lock was lost. Please retry.', 503);
      };
      if (filePath) {
        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
          // Canonicalize the parent even before favorites.json exists (e.g. /tmp symlinks).
          file = path.join(await fs.realpath(path.dirname(filePath)), path.basename(filePath));
          release = await lockfile.lock(file, {
            realpath: false,
            stale: 10_000,
            retries: { retries: 40, factor: 1, minTimeout: 100, maxTimeout: 100 },
            onCompromised: () => { compromised = true; },
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ELOCKED') {
            throw new AppError('FAVORITES_BUSY', 'Favorites are being updated by another instance. Please retry.', 503);
          }
          throw new AppError('FAVORITES_WRITE_FAILED', 'Could not access the favorites storage directory.');
        }
      }
      try {
        const draft = file ? await read(file) : structuredClone(items);
        return await operation(draft, async () => {
          checkLock();
          if (file) await persist(file, draft, checkLock);
          items = structuredClone(draft);
        });
      } finally {
        if (release && !compromised) await release();
      }
    };
    const result = operationChain.then(run);
    operationChain = result.catch(() => {});
    return result;
  }

  function latestSeen(fav: FavoriteService): number {
    const pending = observed.get(fav.favoriteId);
    return pending?.createdAt === fav.createdAt ? Math.max(fav.lastSeenAt, pending.time) : fav.lastSeenAt;
  }

  async function enrich(list: FavoriteService[]): Promise<FavoriteService[]> {
    return Promise.all(list.map(async fav => ({
      ...structuredClone(fav), lastSeenAt: latestSeen(fav), cwdExists: await checkDirectoryExists(fav.cwd),
    })));
  }

  return {
    list: () => transact(async draft => enrich(draft)),

    syncWithServices: (services, observedAt = Date.now()) => transact(async (draft, save) => {
      const matches = matchFavorites(draft, services);
      const now = observedAt;
      const nextObserved = new Map<string, { createdAt: number; time: number }>();
      let changed = false;
      for (const fav of draft) {
        const persistedSeen = fav.lastSeenAt;
        const service = matches.get(fav.favoriteId);
        fav.lastSeenAt = latestSeen(fav);
        if (service) {
          const before = JSON.stringify(fav);
          Object.assign(fav, {
            lastPort: service.port, lastPorts: [...service.ports], displayName: service.displayName,
            command: service.command, commandRedacted: service.commandRedacted, project: service.project,
            category: service.category, isDevOrAgent: service.isDevOrAgent, protocol: service.protocol,
          });
          changed ||= before !== JSON.stringify(fav) || !observed.has(fav.favoriteId) || now - persistedSeen >= LAST_SEEN_SAVE_INTERVAL;
          fav.lastSeenAt = Math.max(fav.lastSeenAt, now);
          nextObserved.set(fav.favoriteId, { createdAt: fav.createdAt, time: fav.lastSeenAt });
        } else {
          // Flush the last successful observation as soon as the service goes offline.
          changed ||= fav.lastSeenAt !== persistedSeen;
        }
      }
      if (changed) await save();
      observed = nextObserved;
      const byService = new Map([...matches].map(([id, service]) => [service.id, id]));
      return {
        services: services.map(service => byService.has(service.id) ? { ...service, favoriteId: byService.get(service.id) } : service),
        favorites: await enrich(draft),
      };
    }),

    add: service => transact(async (draft, save) => {
      const matched = draft.find(fav => computeFavoriteId(fav) === computeFavoriteId(service))?.favoriteId;
      const favoriteId = matched || computeFavoriteId(service);
      const index = draft.findIndex(fav => fav.favoriteId === favoriteId);
      const now = Date.now();
      const record: FavoriteService = {
        favoriteId, createdAt: index >= 0 ? draft[index].createdAt : now, lastSeenAt: now,
        cwd: service.cwd, project: structuredClone(service.project), processName: service.processName,
        command: service.command, commandRedacted: service.commandRedacted, category: service.category,
        framework: service.framework, displayName: service.displayName, isDevOrAgent: service.isDevOrAgent,
        lastPort: service.port, lastPorts: [...service.ports], protocol: service.protocol,
      };
      if (index >= 0) draft[index] = record;
      else draft.unshift(record);
      await save();
      return (await enrich([record]))[0];
    }),

    remove: favoriteId => transact(async (draft, save) => {
      const index = draft.findIndex(fav => fav.favoriteId === favoriteId);
      if (index < 0) return false;
      draft.splice(index, 1);
      await save();
      observed.delete(favoriteId);
      return true;
    }),
  };
}
