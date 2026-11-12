import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolve,
  type AttemptRecord,
  type Corpus,
  type ResolveOptions,
  type ResultsFile,
} from '@chessspeak/voice-parser';
import type { ClipName } from './clips.js';
import type { GateConfig, GateResult } from './gate.js';
import { applyGate } from './gate.js';
import { repoRoot } from './env.js';
import { startWhisper, transcribeWith } from './whisper-process.js';

export function loadCorpus(): Corpus {
  const file = join(repoRoot(), 'packages/voice-parser/corpus/corpus-v0.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Corpus;
}

/** Same ids as spike/web-speech uses for its trials. */
export function trialIdFor(clip: ClipName, split: 'dev' | 'test' | null): string {
  const block =
    clip.condition === 'silence' || clip.condition === 'noise'
      ? clip.condition
      : clip.condition === 'noisy'
        ? 'test-noisy'
        : split === 'dev'
          ? 'dev-quiet'
          : 'test-quiet';
  return `${block}:${clip.phraseId ?? '-'}:r${clip.repetition}`;
}

export interface ClipOutcome {
  attempt: AttemptRecord;
  gate: GateResult;
  /** the clip was sent to whisper-server */
  sent: boolean;
}

export function buildAttempt(
  clip: ClipName,
  corpus: Corpus,
  gate: GateResult,
  transcript: { text: string; ms: number } | undefined,
  parser: ResolveOptions,
  now: Date = new Date(),
): AttemptRecord | undefined {
  const phrase = clip.phraseId === null ? undefined : corpus.phrases.find((p) => p.id === clip.phraseId);
  if (clip.phraseId !== null && phrase === undefined) return undefined;
  const position = phrase === undefined ? undefined : corpus.positions.find((p) => p.id === phrase.positionId);
  const fen = position?.fen ?? corpus.positions[0]!.fen;

  const attempt: AttemptRecord = {
    id: trialIdFor(clip, position?.split ?? null),
    phraseId: phrase?.id ?? null,
    positionId: position?.id ?? null,
    split: position?.split ?? null,
    fen,
    spoken: phrase?.spoken ?? null,
    expectedOutcome: phrase?.expectedOutcome ?? 'nomatch',
    condition: clip.condition,
    repetition: clip.repetition,
    alternatives: transcript === undefined || transcript.text === '' ? [] : [{ transcript: transcript.text }],
    audioFile: clip.file,
    createdAt: now.toISOString(),
  };
  if (phrase?.expectedUci !== undefined) attempt.expectedUci = phrase.expectedUci;
  if (phrase?.expectedCommand !== undefined) attempt.expectedCommand = phrase.expectedCommand;
  if (!gate.pass) attempt.error = `below-gate:${gate.reason}`;
  else if (transcript !== undefined && transcript.text === '') attempt.error = 'empty-transcript';

  if (transcript !== undefined && attempt.alternatives.length > 0) {
    const started = performance.now();
    resolve(fen, attempt.alternatives, parser);
    const resolveMs = performance.now() - started;
    // Whisper latency here is inference on a clip that already exists: it leaves out
    // recording and the HTTP hop from the browser (docs/spike-notes.md).
    attempt.latency = {
      recognitionMs: Math.round(transcript.ms),
      resolveMs: Math.round(resolveMs * 100) / 100,
      totalMs: Math.round(transcript.ms + resolveMs),
    };
  }
  return attempt;
}

export interface ConfigSpec {
  model: 'base' | 'small';
  prompt: string | undefined;
}

export interface RunOptions {
  serverPath: string;
  /**
   * A whisper-server that is already running, e.g. the Linux image of whisper-cloud/ under `docker run`.
   * The benchmark then starts no process: model and prompt are whatever that server was started with.
   */
  url?: string;
  modelPaths: Record<string, string>;
  language: string;
  port: number;
  gate: GateConfig;
  parser: ResolveOptions;
  corpus: Corpus;
  readClip: (clip: ClipName) => Uint8Array;
  onProgress?: (done: number, total: number) => void;
}

export interface ConfigResult {
  spec: ConfigSpec;
  attempts: AttemptRecord[];
  gated: number;
  sent: number;
  skipped: string[];
}

/** One whisper-server process per (model, prompt) pair; clips go through it one by one. */
export async function runConfig(spec: ConfigSpec, clips: ClipName[], options: RunOptions): Promise<ConfigResult> {
  const whisper = options.url !== undefined ? { url: options.url, stop: async () => undefined } : await startLocal(spec, options);
  const attempts: AttemptRecord[] = [];
  const skipped: string[] = [];
  let gated = 0;
  let sent = 0;
  try {
    const gates = clips.map((clip) => ({ clip, bytes: options.readClip(clip) })).map((item) => ({
      ...item,
      gate: applyGate(item.bytes, options.gate),
    }));
    const warm = gates.find((item) => item.gate.pass);
    if (warm !== undefined) await transcribeWith(whisper.url, warm.bytes); // load the model, not measured

    let done = 0;
    for (const { clip, bytes, gate } of gates) {
      const transcript = gate.pass ? await transcribeWith(whisper.url, bytes) : undefined;
      if (gate.pass) sent++;
      else gated++;
      const attempt = buildAttempt(clip, options.corpus, gate, transcript, options.parser);
      if (attempt === undefined) skipped.push(clip.file);
      else attempts.push(attempt);
      options.onProgress?.(++done, gates.length);
    }
  } finally {
    await whisper.stop();
  }
  return { spec, attempts, gated, sent, skipped };
}

function startLocal(spec: ConfigSpec, options: RunOptions): ReturnType<typeof startWhisper> {
  const modelPath = options.modelPaths[spec.model];
  if (modelPath === undefined || modelPath === '') throw new Error(`Falta la ruta del modelo ${spec.model} en .env`);
  return startWhisper({
    serverPath: options.serverPath,
    modelPath,
    language: options.language,
    ...(spec.prompt !== undefined ? { prompt: spec.prompt } : {}),
    port: options.port,
  });
}

export function toResultsFile(
  result: ConfigResult,
  info: { tag: string; corpusVersion: string; parser: Required<ResolveOptions>; gate: GateConfig; fake: boolean; now?: Date },
): ResultsFile {
  const now = info.now ?? new Date();
  const promptLabel = result.spec.prompt === undefined ? 'noprompt' : 'prompt';
  const meta = {
    schema: 1 as const,
    sessionId: `${info.fake ? 'fake-' : ''}whisper-${result.spec.model}-${promptLabel}-${now.toISOString().replace(/[:.]/g, '-')}`,
    // the voice-parser type only lists 'webspeech'; the metrics code does not read this field
    recognizer: `whisper-${result.spec.model}` as unknown as 'webspeech',
    lang: 'es',
    maxAlternatives: 1,
    corpusVersion: info.corpusVersion,
    parser: info.parser,
    userAgent: `whisper.cpp ${info.tag} · modelo ${result.spec.model} · ${result.spec.prompt === undefined ? 'sin prompt' : 'con prompt de ajedrez'}`,
    createdAt: now.toISOString(),
    ...(info.fake ? { fake: true } : {}),
    whisper: { model: result.spec.model, prompt: result.spec.prompt !== undefined, tag: info.tag, gate: info.gate },
  };
  return { meta, attempts: result.attempts };
}
