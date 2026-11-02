import { describe, expect, it } from 'vitest';
import type { ResultsFile } from '@chessspeak/voice-parser';
import { buildAttempt, loadCorpus, toResultsFile, trialIdFor } from '../src/benchmark.js';
import { parseClipName } from '../src/clips.js';
import { applyGate, DEFAULT_GATE, gateFromEnv, measureWav } from '../src/gate.js';
import { buildWhisperReport, replaceBlock, writeRefusals, type WhisperRun } from '../src/whisper-report.js';
import { parseWav } from '../src/wav-read.js';
import { makeWav, tone } from './helpers.js';

const corpus = loadCorpus();
const parser = { threshold: 1, margin: 0.25, rankPenalty: 0.3, nato: false };

describe('wav reading and the gate', () => {
  it('reads what the harness writes', () => {
    const wav = parseWav(makeWav(tone(1, 0.5)));
    expect(wav).toMatchObject({ sampleRate: 16000, channels: 1, bitsPerSample: 16, durationMs: 1000 });
  });

  it('measures RMS in dBFS', () => {
    // a sine of amplitude 0.5 has RMS 0.3536 -> -9.03 dBFS
    expect(measureWav(makeWav(tone(1, 0.5))).rmsDbfs).toBeCloseTo(-9.03, 1);
    expect(measureWav(makeWav(new Float32Array(16000))).rmsDbfs).toBe(-Infinity);
  });

  it('uses the fixed spike thresholds: 300 ms and -50 dBFS', () => {
    expect(DEFAULT_GATE).toEqual({ minDurationMs: 300, minRmsDbfs: -50 });
    expect(applyGate(makeWav(tone(0.2, 0.5)))).toMatchObject({ pass: false, reason: 'too-short' });
    expect(applyGate(makeWav(tone(1, 0.001)))).toMatchObject({ pass: false, reason: 'too-quiet' });
    expect(applyGate(makeWav(new Float32Array(16000)))).toMatchObject({ pass: false, reason: 'too-quiet' });
    expect(applyGate(makeWav(tone(1, 0.2)))).toMatchObject({ pass: true });
  });

  it('reads the thresholds from the environment', () => {
    expect(gateFromEnv({ MIN_DURATION_MS: '500', MIN_RMS_DBFS: '-40' })).toEqual({ minDurationMs: 500, minRmsDbfs: -40 });
    expect(gateFromEnv({})).toEqual(DEFAULT_GATE);
  });
});

describe('clip names', () => {
  it('parses the names the harness writes', () => {
    expect(parseClipName('p05-01_noisy_r2.wav')).toMatchObject({ phraseId: 'p05-01', condition: 'noisy', repetition: 2, fake: false });
    expect(parseClipName('trial_silence_r3.wav')).toMatchObject({ phraseId: null, condition: 'silence', repetition: 3 });
    expect(parseClipName('p05-01_noisy_r2_runB.wav')).toMatchObject({ phraseId: 'p05-01', condition: 'noisy', repetition: 2, fake: false });
    expect(parseClipName('trial_noise_r1_runB.wav')).toMatchObject({ phraseId: null, condition: 'noise', repetition: 1 });
    expect(parseClipName('p01-01_quiet_r1.fake.wav')?.fake).toBe(true);
    expect(parseClipName('notes.wav')).toBeUndefined();
  });

  it('builds the same trial ids as the harness', () => {
    expect(trialIdFor(parseClipName('p01-01_quiet_r1.wav')!, 'dev')).toBe('dev-quiet:p01-01:r1');
    expect(trialIdFor(parseClipName('p05-01_quiet_r2.wav')!, 'test')).toBe('test-quiet:p05-01:r2');
    expect(trialIdFor(parseClipName('p05-01_noisy_r2.wav')!, 'test')).toBe('test-noisy:p05-01:r2');
    expect(trialIdFor(parseClipName('trial_noise_r4.wav')!, null)).toBe('noise:-:r4');
  });
});

describe('attempts from clips', () => {
  const passing = applyGate(makeWav(tone(1, 0.2)));

  it('copies the expectation from the corpus and measures latency', () => {
    const clip = parseClipName('p05-01_quiet_r1.wav')!;
    const attempt = buildAttempt(clip, corpus, passing, { text: 'enroque corto', ms: 800 }, parser)!;
    expect(attempt).toMatchObject({ id: 'test-quiet:p05-01:r1', split: 'test', expectedUci: 'e8g8', audioFile: 'p05-01_quiet_r1.wav' });
    expect(attempt.alternatives).toEqual([{ transcript: 'enroque corto' }]);
    expect(attempt.latency?.recognitionMs).toBe(800);
    expect(attempt.latency!.totalMs).toBeGreaterThanOrEqual(800);
  });

  it('records clips stopped by the gate with no text and no latency', () => {
    const gated = applyGate(makeWav(new Float32Array(16000)));
    const attempt = buildAttempt(parseClipName('trial_silence_r1.wav')!, corpus, gated, undefined, parser)!;
    expect(attempt).toMatchObject({ split: null, expectedOutcome: 'nomatch', error: 'below-gate:too-quiet', alternatives: [] });
    expect(attempt.latency).toBeUndefined();
  });

  it('skips clips of phrases that are not in the corpus', () => {
    expect(buildAttempt(parseClipName('zz-99_quiet_r1.wav')!, corpus, passing, { text: 'x', ms: 1 }, parser)).toBeUndefined();
  });
});

describe('refusing to write synthetic or non-test results', () => {
  const clip = parseClipName('p05-01_quiet_r1.wav')!;
  const attempt = buildAttempt(clip, corpus, applyGate(makeWav(tone(1, 0.2))), { text: 'enroque corto', ms: 800 }, parser)!;
  const result = { spec: { model: 'base' as const, prompt: undefined }, attempts: [attempt], gated: 0, sent: 1, skipped: [] };
  const info = { tag: 'b0', corpusVersion: 'v0', parser, gate: DEFAULT_GATE };
  const run = (fake: boolean): WhisperRun => ({
    name: fake ? 'x.fake.json' : 'x.json',
    results: toResultsFile(result, { ...info, fake }) as ResultsFile,
    gated: 0,
    sent: 1,
  });

  it('accepts real clips from the test split', () => {
    expect(writeRefusals([run(false)], 'test', ['p05-01_quiet_r1.wav'])).toEqual([]);
  });

  it('refuses synthetic results, fake clips and other splits', () => {
    expect(writeRefusals([run(true)], 'test', []).join(' ')).toMatch(/fake/);
    expect(writeRefusals([run(false)], 'test', ['a_quiet_r1.fake.wav']).join(' ')).toMatch(/sintéticos/);
    expect(writeRefusals([run(false)], 'dev', []).join(' ')).toMatch(/test/);
    expect(writeRefusals([run(false)], 'all', []).length).toBe(1);
  });

  it('marks the session of fake results with a fake prefix', () => {
    expect(run(true).results.meta.sessionId.startsWith('fake-')).toBe(true);
    expect(run(true).results.meta.fake).toBe(true);
  });

  it('renders a report with the computed counts', () => {
    const report = buildWhisperReport([run(false)], { split: 'test', parser, gate: DEFAULT_GATE, tag: 'b0' });
    expect(report).toContain('300 ms');
    expect(report).toContain('optimista');
    expect(report).toContain('Frenados por la puerta');
  });

  it('replaces only what is between the markers', () => {
    const doc = 'a\n<!-- s -->\nold\n<!-- e -->\nz';
    expect(replaceBlock(doc, '<!-- s -->', '<!-- e -->', 'new')).toBe('a\n<!-- s -->\n\nnew\n\n<!-- e -->\nz');
    expect(() => replaceBlock('nothing', '<!-- s -->', '<!-- e -->', 'x')).toThrow(/marcadores/);
  });
});
