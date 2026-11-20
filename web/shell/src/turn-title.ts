import { csEventSchemas, type CsEventDetail } from '@chessspeak/shared';

type Position = CsEventDetail<'cs:position'>;

export const BASE_TITLE = 'ChessSpeak';

/**
 * The title of the tab, so a player in another tab sees that it is their turn. Only for a seat in a live game:
 * a spectator, a waiting game and a finished one keep the plain title.
 */
export function titleFor(position: Position | undefined, ended: boolean): string {
  if (position === undefined || ended || position.yourColor === 'spectator') return BASE_TITLE;
  if (position.status !== undefined && position.status !== 'active') return BASE_TITLE;
  return position.turn === position.yourColor ? `● Te toca · ${BASE_TITLE}` : `Turno del rival · ${BASE_TITLE}`;
}

/**
 * Follows cs:position and cs:game-ended of the game on screen. Returns the function that applies the title again,
 * which the shell calls when the route changes.
 */
export function followTurn(target: EventTarget, currentGameId: () => string | null, setTitle: (title: string) => void): () => void {
  let position: Position | undefined;
  const ended = new Set<string>();
  const update = (): void => {
    const gameId = currentGameId();
    const shown = position !== undefined && position.gameId === gameId ? position : undefined;
    setTitle(titleFor(shown, gameId !== null && ended.has(gameId)));
  };
  target.addEventListener('cs:position', (event) => {
    const detail = csEventSchemas['cs:position'].safeParse((event as CustomEvent).detail);
    if (!detail.success) return;
    position = detail.data;
    update();
  });
  target.addEventListener('cs:game-ended', (event) => {
    const detail = csEventSchemas['cs:game-ended'].safeParse((event as CustomEvent).detail);
    if (!detail.success) return;
    ended.add(detail.data.gameId);
    update();
  });
  return update;
}
