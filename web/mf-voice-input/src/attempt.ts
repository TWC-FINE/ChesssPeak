import { normalizeText, type Resolution } from '@chessspeak/voice-parser';
import type { Recognizer, VoiceAttemptPayload } from '@chessspeak/shared';

/** Separates normal games from evaluation sessions, which set `expectedUci`. */
const PLAY_SESSION = 'play';
const MAX_ALTERNATIVES = 10;
const MAX_CANDIDATES = 3;

export interface SpokenAttempt {
  gameId: string;
  ply: number;
  fen: string;
  lang: string;
  recognizer: Recognizer;
  alternatives: VoiceAttemptPayload['alternatives'];
  transcript: string;
  resolution: Resolution;
  accepted: boolean;
  tryIndex: number;
  recognitionMs: number;
  resolveMs: number;
}

/** The telemetry of one utterance. Never audio; `player` and `createdAt` are set by the server. */
export function buildAttempt(spoken: SpokenAttempt): VoiceAttemptPayload {
  const { resolution } = spoken;
  const recognitionMs = Math.round(spoken.recognitionMs);
  const resolveMs = Math.round(spoken.resolveMs);
  return {
    gameId: spoken.gameId,
    ply: spoken.ply,
    fen: spoken.fen,
    lang: spoken.lang,
    recognizer: spoken.recognizer,
    alternatives: spoken.alternatives.slice(0, MAX_ALTERNATIVES),
    transcript: spoken.transcript,
    normalized: normalizeText(spoken.transcript),
    candidates: resolution.kind === 'command' ? [] : resolution.candidates.slice(0, MAX_CANDIDATES).map((candidate) => ({ uci: candidate.uci, score: candidate.distance })),
    resolvedUci: resolution.kind === 'move' ? resolution.uci : null,
    outcome: resolution.kind,
    accepted: spoken.accepted,
    tryIndex: spoken.tryIndex,
    latency: { recognitionMs, resolveMs, totalMs: recognitionMs + resolveMs },
    session: PLAY_SESSION,
  };
}
