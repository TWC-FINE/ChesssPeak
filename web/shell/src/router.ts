export type Route = { name: 'home' } | { name: 'game'; id: string } | { name: 'ranking' } | { name: 'not-found'; hash: string };

/** Hash router: `#/`, `#/game/:id` and `#/ranking`. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { name: 'home' };
  if (/^\/ranking\/?$/.test(path)) return { name: 'ranking' };
  const game = /^\/game\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (game !== null) return { name: 'game', id: game[1] as string };
  return { name: 'not-found', hash };
}

export function gameIdOf(route: Route): string | null {
  return route.name === 'game' ? route.id : null;
}

/** Where a game lives, for links and for cs:open-game. */
export function gameHash(gameId: string): string {
  return `#/game/${encodeURIComponent(gameId)}`;
}
