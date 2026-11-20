import { csEventSchemas } from '@chessspeak/shared';
import { gameHash, parseRoute } from './router.js';

/**
 * Follows cs:open-game, the request of a microfrontend to show another game (a rematch). The route is the shell's,
 * so only the shell changes it, and only to an id the router accepts.
 */
export function followGameRequests(target: EventTarget, go: (hash: string) => void): void {
  target.addEventListener('cs:open-game', (event) => {
    const request = csEventSchemas['cs:open-game'].safeParse((event as CustomEvent).detail);
    if (!request.success) return;
    const hash = gameHash(request.data.gameId);
    if (parseRoute(hash).name !== 'game') return;
    go(hash);
  });
}
