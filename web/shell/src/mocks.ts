import type { GameContext, HistoryContext, VoiceInputContext } from '@chessspeak/shared';

/** Simulated contexts the shell injects through `el.context` until the real session and socket exist. */
export function mockContext(tag: string, gameId: string | null, agentUrl: string | null = null): GameContext | VoiceInputContext | HistoryContext | undefined {
  switch (tag) {
    case 'mf-game':
      return { v: 1, gameId, orientation: 'white', socket: null };
    case 'mf-voice-input':
      return { v: 1, gameId, lang: 'es-CO', recognizer: 'webspeech', agentUrl };
    case 'mf-history':
      return { v: 1, gameId };
    default:
      return undefined;
  }
}
