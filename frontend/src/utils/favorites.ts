import type { FavoriteService, PortService } from '../types.js';
import { matchFavorites } from '../../../src/favorite-matching.js';

/** Derive runtime state only from a successful scan, independently of stored history. */
export function favoriteViews(favorites: FavoriteService[], services: PortService[], scanKnown: boolean) {
  const matches = scanKnown ? matchFavorites(favorites, services) : new Map<string, PortService>();
  const byService = new Map([...matches].map(([id, service]) => [service.id, id]));
  const running = services.map(service => ({
    ...service, favoriteId: byService.get(service.id), runtimeUnknown: !scanKnown,
  }));
  const saved: PortService[] = favorites.map(fav => {
    const live = matches.get(fav.favoriteId);
    if (live) return { ...live, favoriteId: fav.favoriteId };
    return {
      id: `favorite:${fav.favoriteId}`, pid: 0, ppid: 0, user: '-',
      port: fav.lastPort, ports: fav.lastPorts, protocol: fav.protocol, listenAddresses: [],
      processName: fav.processName, command: fav.command, commandRedacted: fav.commandRedacted,
      cwd: fav.cwd, project: fav.project, category: fav.category, framework: fav.framework,
      displayName: fav.displayName, isDevOrAgent: fav.isDevOrAgent,
      cpu: 0, memoryMb: 0, uptime: '-', uptimeSec: 0,
      favoriteId: fav.favoriteId, isOffline: scanKnown, runtimeUnknown: !scanKnown,
      lastSeenAt: fav.lastSeenAt, cwdExists: fav.cwdExists,
    };
  });
  return { running, saved };
}
