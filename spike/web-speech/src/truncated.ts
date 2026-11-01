import { normalizeText, resolve, tokenize, type AttemptRecord, type ResolveOptions } from '@chessspeak/voice-parser';

/** docs/spike-run-b.md, "Regla de lectura de A y B", point 4. */
export const RUN_B_MAX_TRUNCATED = 2;

/** Raw word of the expected phrase behind each canonical token, or undefined if they do not line up one to one. */
function rawWordPerToken(expected: string): string[] | undefined {
  const perToken: string[] = [];
  for (const word of normalizeText(expected).split(' ')) {
    if (word === '') continue;
    for (const _ of tokenize(word)) perToken.push(word);
  }
  return perToken.length === tokenize(expected).length ? perToken : undefined;
}

/**
 * "Truncated" (docs/spike-run-b.md): the first alternative, tokenized by the parser, is a proper
 * prefix of the expected phrase tokenized the same way. The last recognized word may be unfinished
 * ("cu" for "cuatro"): it must then be a proper prefix of the expected word at that position.
 */
export function isTruncated(recognized: string, expected: string): boolean {
  const got = tokenize(recognized);
  const want = tokenize(expected);
  if (got.length === 0 || got.length > want.length) return false;
  const head = got.slice(0, -1);
  if (!head.every((token, i) => token === want[i])) return false;
  const last = got[got.length - 1]!;
  if (got.length < want.length && last === want[got.length - 1]) return true;
  const word = rawWordPerToken(expected)?.[got.length - 1];
  return word !== undefined && word.length > last.length && word.startsWith(last);
}

export interface TruncatedAttempt {
  id: string;
  spoken: string;
  recognized: string;
  correct: boolean;
}

export interface ConditionCount {
  valid: number;
  failed: number;
  truncated: number;
  /** Failures that are not truncated: the control of docs/spike-run-b.md. */
  control: number;
}

export interface TruncationSummary {
  valid: number;
  truncated: number;
  truncatedCorrect: number;
  truncatedFailed: number;
  control: number;
  byCondition: { quiet: ConditionCount; noisy: ConditionCount };
  truncatedAttempts: TruncatedAttempt[];
}

const empty = (): ConditionCount => ({ valid: 0, failed: 0, truncated: 0, control: 0 });

/**
 * Counts over the valid set V of docs/spike-criteria.md (expected move, quiet or noisy) with the first
 * alternative only. An attempt is correct when the parser resolves it to the expected move.
 */
export function summarizeTruncation(attempts: AttemptRecord[], parser: ResolveOptions): TruncationSummary {
  const summary: TruncationSummary = {
    valid: 0,
    truncated: 0,
    truncatedCorrect: 0,
    truncatedFailed: 0,
    control: 0,
    byCondition: { quiet: empty(), noisy: empty() },
    truncatedAttempts: [],
  };
  for (const attempt of attempts) {
    if (attempt.expectedOutcome !== 'move' || (attempt.condition !== 'quiet' && attempt.condition !== 'noisy')) continue;
    if (attempt.spoken === null) continue;
    const recognized = attempt.alternatives[0]?.transcript ?? '';
    const resolution = resolve(attempt.fen, attempt.alternatives.slice(0, 1), parser);
    const correct = resolution.kind === 'move' && resolution.uci === attempt.expectedUci;
    const truncated = recognized !== '' && isTruncated(recognized, attempt.spoken);
    const bucket = summary.byCondition[attempt.condition];
    summary.valid++;
    bucket.valid++;
    if (!correct) bucket.failed++;
    if (truncated) {
      summary.truncated++;
      bucket.truncated++;
      if (correct) summary.truncatedCorrect++;
      else summary.truncatedFailed++;
      summary.truncatedAttempts.push({ id: attempt.id, spoken: attempt.spoken, recognized, correct });
    } else if (!correct) {
      bucket.control++;
    }
  }
  summary.control = summary.byCondition.noisy.control;
  return summary;
}
