import type { GameContext, HistoryContext, VoiceInputContext } from '@chessspeak/shared';

/** Simulated contexts the shell injects through `el.context` until the real session and socket exist. */
export function mockContext(tag: string, gameId: string | null): GameContext | VoiceInputContext | HistoryContext | undefined {
  switch (tag) {
    case 'mf-game':
      return { v: 1, gameId, orientation: 'white' };
    case 'mf-voice-input':
      return { v: 1, lang: 'es-CO', recognizer: 'webspeech', releaseDelayMs: 400 };
    case 'mf-history':
      return { v: 1, gameId, moves: gameId === null ? [] : ['e2e4', 'e7e5'] };
    default:
      return undefined;
  }
}
