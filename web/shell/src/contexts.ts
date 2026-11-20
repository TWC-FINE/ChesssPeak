import type { GameContext, GameSocket, HistoryContext, RankingContext, VoiceInputContext } from '@chessspeak/shared';

/** What <mf-ranking> needs from the shell: where the server is, and whether its route is on screen. */
export interface RankingView {
  apiUrl: string | null;
  active: boolean;
}

/**
 * The context each microfrontend receives through `el.context`. Least privilege: only <mf-game> gets the socket.
 * `socket` is null until it is connected, and again while it is disconnected.
 */
export function contextFor(
  tag: string,
  gameId: string | null,
  agentUrl: string | null,
  socket: GameSocket | null,
  ranking: RankingView = { apiUrl: null, active: false },
): GameContext | VoiceInputContext | HistoryContext | RankingContext | undefined {
  switch (tag) {
    case 'mf-game':
      return { v: 1, gameId, orientation: 'white', socket };
    case 'mf-voice-input':
      return { v: 1, gameId, lang: 'es-CO', recognizer: 'webspeech', agentUrl };
    case 'mf-history':
      return { v: 1, gameId };
    case 'mf-ranking':
      // no socket and no token: GET /ranking is public
      return { v: 1, apiUrl: ranking.apiUrl, active: ranking.active };
    default:
      return undefined;
  }
}
