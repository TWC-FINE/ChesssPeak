export type Route = { name: 'home' } | { name: 'game'; id: string } | { name: 'not-found'; hash: string };

/** Hash router: `#/` and `#/game/:id`. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { name: 'home' };
  const game = /^\/game\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (game !== null) return { name: 'game', id: game[1] as string };
  return { name: 'not-found', hash };
}

export function gameIdOf(route: Route): string | null {
  return route.name === 'game' ? route.id : null;
}
