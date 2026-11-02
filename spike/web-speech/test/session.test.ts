import corpusJson from '@chessspeak/voice-parser/corpus/corpus-v0.json';
import type { Corpus } from '@chessspeak/voice-parser';
import { describe, expect, it } from 'vitest';
import {
  buildAttempt,
  buildBlocks,
  buildImprovisedAttempt,
  computeLatency,
  DEFAULT_PLAN,
  nextTrial,
  progress,
  type RecognitionOutcome,
} from '../src/session.js';
import { concatChunks, downsample, encodeWav, wavFileName } from '../src/wav.js';

const corpus = corpusJson as unknown as Corpus;
const blocks = buildBlocks(corpus);

describe('corpus plan', () => {
  it('asks for dev once and test three times in quiet and in noise', () => {
    const dev = corpus.phrases.filter((p) => corpus.positions.find((x) => x.id === p.positionId)?.split === 'dev');
    const test = corpus.phrases.filter((p) => corpus.positions.find((x) => x.id === p.positionId)?.split === 'test');
    expect(blocks['dev-quiet']).toHaveLength(dev.length * DEFAULT_PLAN.devReps);
    expect(blocks['test-quiet']).toHaveLength(test.length * 3);
    expect(blocks['test-noisy']).toHaveLength(test.length * 3);
    expect(blocks.silence).toHaveLength(10);
    expect(blocks.noise).toHaveLength(10);
  });

  it('numbers the repetitions and never asks the same phrase twice in a row', () => {
    const trials = blocks['test-quiet'];
    expect(Math.max(...trials.map((t) => t.repetition))).toBe(3);
    for (let i = 1; i < trials.length; i++) {
      expect(trials[i]!.phrase?.id).not.toBe(trials[i - 1]!.phrase?.id);
    }
  });

  it('has unique trial ids and tags the conditions', () => {
    const all = Object.values(blocks).flat();
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
    expect(blocks['test-noisy'].every((t) => t.condition === 'noisy')).toBe(true);
    expect(blocks.silence.every((t) => t.phrase === null && t.condition === 'silence')).toBe(true);
  });

  it('moves on to the next undone trial and tracks progress', () => {
    const first = nextTrial(blocks, 'test-quiet', new Set())!;
    const done = new Set([first.id]);
    expect(nextTrial(blocks, 'test-quiet', done)?.id).not.toBe(first.id);
    expect(progress(blocks, 'test-quiet', done).done).toBe(1);
    expect(nextTrial(blocks, 'test-quiet', new Set(blocks['test-quiet'].map((t) => t.id)))).toBeUndefined();
  });
});

describe('attempt records', () => {
  const trial = blocks['test-noisy'][0]!;
  const outcome: RecognitionOutcome = {
    alternatives: [{ transcript: 'enroque corto', confidence: 0.9 }],
    releasedAt: 1000,
    resultAt: 1800,
  };

  it('measures latency from the button release', () => {
    expect(computeLatency(outcome, 4)).toEqual({ recognitionMs: 800, resolveMs: 4, totalMs: 804 });
    // a result that arrived before the release costs only the parser time
    expect(computeLatency({ ...outcome, resultAt: 900 }, 4)).toEqual({ recognitionMs: 0, resolveMs: 4, totalMs: 4 });
  });

  it('copies the expectation, condition and repetition from the trial', () => {
    const attempt = buildAttempt(trial, outcome, 4, 'x.wav', new Date('2026-11-01T10:00:00Z'));
    expect(attempt).toMatchObject({
      id: trial.id,
      split: 'test',
      condition: 'noisy',
      repetition: 1,
      expectedOutcome: trial.phrase!.expectedOutcome,
      audioFile: 'x.wav',
      createdAt: '2026-11-01T10:00:00.000Z',
    });
    expect(attempt.latency?.totalMs).toBe(804);
  });

  it('records silence trials as expecting nothing and without latency', () => {
    const silence = blocks.silence[0]!;
    const attempt = buildAttempt(silence, { alternatives: [], error: 'no-speech', releasedAt: 1, resultAt: 2 }, 0, undefined);
    expect(attempt).toMatchObject({ phraseId: null, split: null, expectedOutcome: 'nomatch', error: 'no-speech' });
    expect(attempt.latency).toBeUndefined();
  });
});

describe('improvised attempts', () => {
  const outcome: RecognitionOutcome = {
    alternatives: [{ transcript: 'caballo be cuatro', confidence: 0.8 }],
    releasedAt: 1000,
    resultAt: 1500,
  };

  it('belongs to no split, so the deciding metrics never count it', () => {
    const attempt = buildImprovisedAttempt(2, 'p05', 'fen', 'b1c3', outcome, 3, new Date('2026-11-01T10:00:00Z'));
    expect(attempt).toMatchObject({
      id: 'imp:2',
      phraseId: null,
      positionId: 'p05',
      split: null,
      expectedOutcome: 'move',
      expectedUci: 'b1c3',
      condition: 'quiet',
    });
    expect(attempt.latency?.totalMs).toBe(503);
  });

  it('keeps the recognizer error and skips latency when nothing was recognised', () => {
    const attempt = buildImprovisedAttempt(1, 'p08', 'fen', 'a1d1', { alternatives: [], error: 'no-speech', releasedAt: 1, resultAt: 2 }, 0);
    expect(attempt.error).toBe('no-speech');
    expect(attempt.latency).toBeUndefined();
  });
});

describe('wav', () => {
  it('writes a valid 16 kHz mono 16-bit header', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16000);
    const view = new DataView(wav.buffer);
    const text = (offset: number, n: number) => String.fromCharCode(...wav.slice(offset, offset + n));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(wav.length).toBe(44 + 8);
    expect(view.getInt16(46, true)).toBe(16384);
    expect(view.getInt16(48, true)).toBe(-16384);
    expect(view.getInt16(50, true)).toBe(0x7fff);
  });

  it('downsamples 48 kHz to 16 kHz keeping the duration', () => {
    const input = new Float32Array(4800).fill(0.25);
    const out = downsample(input, 48000, 16000);
    expect(out).toHaveLength(1600);
    expect(out[10]).toBeCloseTo(0.25);
  });

  it('concatenates chunks and builds safe file names', () => {
    expect(Array.from(concatChunks([new Float32Array([1, 2]), new Float32Array([3])]))).toEqual([1, 2, 3]);
    expect(wavFileName('p05-01', 'noisy', 2)).toBe('p05-01_noisy_r2.wav');
    expect(wavFileName(null, 'silence', 3)).toBe('trial_silence_r3.wav');
    expect(wavFileName('p05-01', 'noisy', 2, 'B')).toBe('p05-01_noisy_r2_runB.wav');
    expect(wavFileName(null, 'noise', 1, 'A')).toBe('trial_noise_r1_runA.wav');
  });
});
