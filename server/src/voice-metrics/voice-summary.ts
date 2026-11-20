import { recognizerSchema, type Rate, type RecognizerSummary, type VoiceSummaryResponse } from '@chessspeak/shared';
import type { AttemptRow } from '../database/mongo/voice-attempts.repository';

/** Nearest rank, the same as packages/voice-parser/src/stats.ts, so these times read like those of the spike. */
export function percentile(values: readonly number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** Wilson score interval at 95 %, also the same as voice-parser's. */
export function wilson(successes: number, total: number): Rate | null {
  if (total === 0) return null;
  const z = 1.959964;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return { value: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function percentiles(values: readonly number[]): { p50: number; p95: number } | null {
  const p50 = percentile(values, 50);
  const p95 = percentile(values, 95);
  return p50 === undefined || p95 === undefined ? null : { p50: Math.round(p50), p95: Math.round(p95) };
}

function summarizeRecognizer(recognizer: RecognizerSummary['recognizer'], rows: readonly AttemptRow[]): RecognizerSummary {
  const outcomes = { move: 0, ambiguous: 0, nomatch: 0, command: 0 };
  for (const row of rows) outcomes[row.outcome]++;
  const proposed = rows.filter((row) => row.outcome === 'move');
  const confirmed = proposed.filter((row) => row.accepted).length;
  // a silence has no recognition worth timing: it only waited for the end of the utterance
  const heard = rows.filter((row) => !row.silent);
  return {
    recognizer,
    attempts: rows.length,
    silences: rows.length - heard.length,
    outcomes,
    proposed: proposed.length,
    confirmed,
    confirmedRate: wilson(confirmed, proposed.length),
    recognitionMs: percentiles(heard.map((row) => row.latency.recognitionMs)),
    totalMs: percentiles(heard.map((row) => row.latency.totalMs)),
  };
}

/** The summary of GET /voice-metrics/summary. Computed here, in Node: Mongo only returns the rows (AGENTS.md). */
export function summarizeVoice(rows: readonly AttemptRow[], limit: number): VoiceSummaryResponse {
  const times = rows.map((row) => row.createdAt.getTime());
  return {
    attempts: rows.length,
    limit,
    since: rows.length === 0 ? null : new Date(Math.min(...times)).toISOString(),
    until: rows.length === 0 ? null : new Date(Math.max(...times)).toISOString(),
    recognizers: recognizerSchema.options
      .map((recognizer) => [recognizer, rows.filter((row) => row.recognizer === recognizer)] as const)
      .filter(([, mine]) => mine.length > 0)
      .map(([recognizer, mine]) => summarizeRecognizer(recognizer, mine)),
  };
}
