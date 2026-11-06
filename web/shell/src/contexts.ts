import type { GameContext, GameSocket, HistoryContext, VoiceInputContext } from '@chessspeak/shared';

/**
 * The context each microfrontend receives through `el.context`. Least privilege: only <mf-game> gets the socket.
 * `socket` is null until it is connected, and again while it is disconnected.
 */
export function contextFor(
  tag: string,
  gameId: string | null,
  agentUrl: string | null,
  socket: GameSocket | null,
): GameContext | VoiceInputContext | HistoryContext | undefined {
  switch (tag) {
    case 'mf-game':
      return { v: 1, gameId, orientation: 'white', socket };
    case 'mf-voice-input':
      return { v: 1, gameId, lang: 'es-CO', recognizer: 'text', agentUrl };
    case 'mf-history':
      return { v: 1, gameId };
    default:
      return undefined;
  }
}
