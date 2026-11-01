import type { FavoriteService, PortService } from './types.js';

/** Keep the full entry point and arguments; only a known listening --port may vary. */
function matchingCommand(service: Pick<PortService, 'command' | 'ports'>): string {
  return service.command.replace(/(^|\s)--port(?:=|\s+)(\d+)(?=\s|$)/g,
    (match, prefix: string, port: string) => service.ports.includes(Number(port)) ? `${prefix}--port <PORT>` : match);
}

export function matchFavorites(items: FavoriteService[], services: PortService[]): Map<string, PortService> {
  const matches = new Map<string, PortService>();
  const used = new Set<string>();
  const sameIdentity = (fav: FavoriteService, service: PortService) =>
    fav.cwd === service.cwd && fav.processName === service.processName && fav.framework === service.framework;
  const passes = [
    (fav: FavoriteService, service: PortService) => sameIdentity(fav, service) && fav.command === service.command,
    (fav: FavoriteService, service: PortService) => Boolean(fav.cwd && fav.cwd !== '/' &&
      !fav.commandRedacted && !service.commandRedacted && !/["'`]/.test(fav.command + service.command) &&
      sameIdentity(fav, service) &&
      matchingCommand({ command: fav.command, ports: fav.lastPorts }) === matchingCommand(service)),
  ];
  for (const accepts of passes) {
    const remaining = items.filter(fav => !matches.has(fav.favoriteId));
    const available = services.filter(service => !used.has(service.id));
    for (const fav of remaining) {
      const candidates = available.filter(service => accepts(fav, service));
      if (candidates.length !== 1) continue;
      const candidate = candidates[0];
      // Both sides must be unambiguous, independent of scan/list ordering.
      if (remaining.filter(other => accepts(other, candidate)).length !== 1) continue;
      matches.set(fav.favoriteId, candidate);
      used.add(candidate.id);
    }
  }
  return matches;
}
