import type {
  AttemptLatency,
  AttemptRecord,
  Condition,
  Corpus,
  CorpusPhrase,
  CorpusPosition,
} from '@chessspeak/voice-parser';
import { phrasesOfSplit, positionOf } from '@chessspeak/voice-parser';

export type BlockId = 'dev-quiet' | 'test-quiet' | 'test-noisy' | 'silence' | 'noise';

export const BLOCK_ORDER: BlockId[] = ['dev-quiet', 'test-quiet', 'test-noisy', 'silence', 'noise'];

export const BLOCK_LABEL: Record<BlockId, string> = {
  'dev-quiet': 'Dev · ambiente tranquilo',
  'test-quiet': 'Test · ambiente tranquilo',
  'test-noisy': 'Test · con ruido de fondo',
  silence: 'Silencio (sin hablar, ambiente tranquilo)',
  noise: 'Ruido (sin hablar, con ruido de fondo)',
};

export interface PlanConfig {
  devReps: number;
  testQuietReps: number;
  testNoisyReps: number;
  silenceTrials: number;
  noiseTrials: number;
}

/** docs/spike-criteria.md section 3, rule 4. */
export const DEFAULT_PLAN: PlanConfig = {
  devReps: 1,
  testQuietReps: 3,
  testNoisyReps: 3,
  silenceTrials: 10,
  noiseTrials: 10,
};

export interface Trial {
  /** Same as the attempt id: unique per block + phrase + repetition. */
  id: string;
  block: BlockId;
  condition: Condition;
  repetition: number;
  repetitions: number;
  phrase: CorpusPhrase | null;
  position: CorpusPosition | null;
  fen: string;
}

export const trialId = (block: BlockId, phraseId: string | null, repetition: number): string =>
  `${block}:${phraseId ?? '-'}:r${repetition}`;

function phraseTrials(
  corpus: Corpus,
  block: BlockId,
  split: 'dev' | 'test',
  condition: Condition,
  repetitions: number,
): Trial[] {
  const phrases = phrasesOfSplit(corpus, split);
  const trials: Trial[] = [];
  // rounds: every phrase once, then again, so the same phrase never comes twice in a row
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    for (const phrase of phrases) {
      const position = positionOf(corpus, phrase);
      trials.push({
        id: trialId(block, phrase.id, repetition),
        block,
        condition,
        repetition,
        repetitions,
        phrase,
        position,
        fen: position.fen,
      });
    }
  }
  return trials;
}

function nonSpeechTrials(
  corpus: Corpus,
  block: 'silence' | 'noise',
  count: number,
): Trial[] {
  const fen = corpus.positions[0]!.fen;
  return Array.from({ length: count }, (_, i) => ({
    id: trialId(block, null, i + 1),
    block,
    condition: block,
    repetition: i + 1,
    repetitions: count,
    phrase: null,
    position: null,
    fen,
  }));
}

export function buildBlocks(corpus: Corpus, plan: PlanConfig = DEFAULT_PLAN): Record<BlockId, Trial[]> {
  return {
    'dev-quiet': phraseTrials(corpus, 'dev-quiet', 'dev', 'quiet', plan.devReps),
    'test-quiet': phraseTrials(corpus, 'test-quiet', 'test', 'quiet', plan.testQuietReps),
    'test-noisy': phraseTrials(corpus, 'test-noisy', 'test', 'noisy', plan.testNoisyReps),
    silence: nonSpeechTrials(corpus, 'silence', plan.silenceTrials),
    noise: nonSpeechTrials(corpus, 'noise', plan.noiseTrials),
  };
}

/** First trial of the block that has no attempt yet. */
export function nextTrial(blocks: Record<BlockId, Trial[]>, block: BlockId, doneIds: Set<string>): Trial | undefined {
  return blocks[block].find((trial) => !doneIds.has(trial.id));
}

export function progress(blocks: Record<BlockId, Trial[]>, block: BlockId, doneIds: Set<string>): { done: number; total: number } {
  const trials = blocks[block];
  return { done: trials.filter((t) => doneIds.has(t.id)).length, total: trials.length };
}

export interface RecognitionOutcome {
  alternatives: { transcript: string; confidence?: number }[];
  error?: string;
  /** performance.now() when the button was released */
  releasedAt: number;
  /** performance.now() when the recognizer delivered its final result (or ended) */
  resultAt: number;
}

export function computeLatency(outcome: RecognitionOutcome, resolveMs: number): AttemptLatency {
  const recognitionMs = Math.max(0, outcome.resultAt - outcome.releasedAt);
  return {
    recognitionMs: Math.round(recognitionMs),
    resolveMs: Math.round(resolveMs * 100) / 100,
    totalMs: Math.round(recognitionMs + resolveMs),
  };
}

export function buildAttempt(
  trial: Trial,
  outcome: RecognitionOutcome,
  resolveMs: number,
  audioFile: string | undefined,
  now: Date = new Date(),
): AttemptRecord {
  const phrase = trial.phrase;
  const attempt: AttemptRecord = {
    id: trial.id,
    phraseId: phrase?.id ?? null,
    positionId: trial.position?.id ?? null,
    split: trial.position?.split ?? null,
    fen: trial.fen,
    spoken: phrase?.spoken ?? null,
    expectedOutcome: phrase?.expectedOutcome ?? 'nomatch',
    condition: trial.condition,
    repetition: trial.repetition,
    alternatives: outcome.alternatives,
    createdAt: now.toISOString(),
  };
  if (phrase?.expectedUci !== undefined) attempt.expectedUci = phrase.expectedUci;
  if (phrase?.expectedCommand !== undefined) attempt.expectedCommand = phrase.expectedCommand;
  if (outcome.error !== undefined) attempt.error = outcome.error;
  if (outcome.alternatives.length > 0) attempt.latency = computeLatency(outcome, resolveMs);
  if (audioFile !== undefined) attempt.audioFile = audioFile;
  return attempt;
}
