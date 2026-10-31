import type { ExpectedOutcome, Split } from './corpus.js';
import type { Alternative, Command } from './types.js';

/**
 * quiet / noisy: the phrase is spoken in a quiet room / with background noise.
 * silence / noise: the button is held without speaking, in a quiet room / with background noise.
 */
export type Condition = 'quiet' | 'noisy' | 'silence' | 'noise';

export interface AttemptLatency {
  /** Button release -> recognizer's final result. */
  recognitionMs: number;
  /** Time spent in `resolve`. */
  resolveMs: number;
  /** Button release -> proposal ready. */
  totalMs: number;
}

export interface AttemptRecord {
  id: string;
  /** null for silence / noise trials, which are not corpus phrases. */
  phraseId: string | null;
  positionId: string | null;
  split: Split | null;
  fen: string;
  spoken: string | null;
  expectedOutcome: ExpectedOutcome;
  expectedUci?: string;
  expectedCommand?: Command;
  condition: Condition;
  /** 1-based repetition of this phrase in this condition. */
  repetition: number;
  /** Raw N-best list from the recognizer, best first. */
  alternatives: Alternative[];
  /** Recognizer error such as `no-speech`, if any. */
  error?: string;
  latency?: AttemptLatency;
  audioFile?: string;
  createdAt: string;
}

export interface ResultsMeta {
  schema: 1;
  sessionId: string;
  recognizer: 'webspeech';
  lang: string;
  maxAlternatives: number;
  corpusVersion: string;
  parser: { threshold: number; margin: number; rankPenalty: number; nato: boolean };
  userAgent: string;
  speaker?: string;
  createdAt: string;
  /** Synthetic data used only to test the metrics script. Never evidence. */
  fake?: boolean;
}

export interface ResultsFile {
  meta: ResultsMeta;
  attempts: AttemptRecord[];
}
