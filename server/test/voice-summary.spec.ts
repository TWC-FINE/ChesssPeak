import 'reflect-metadata';
import { Global, Logger, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { VOICE_SUMMARY_LIMIT, voiceSummaryResponseSchema } from '@chessspeak/shared';
import request from 'supertest';
import { VoiceAttemptsRepository, type AttemptRow } from '../src/database/mongo/voice-attempts.repository';
import { VoiceMetricsModule } from '../src/voice-metrics/voice-metrics.module';
import { percentile, summarizeVoice, wilson } from '../src/voice-metrics/voice-summary';

const row = (over: Partial<AttemptRow> = {}): AttemptRow => ({
  recognizer: 'webspeech',
  outcome: 'move',
  accepted: true,
  silent: false,
  latency: { recognitionMs: 500, totalMs: 510 },
  createdAt: new Date('2026-11-20T10:00:00.000Z'),
  ...over,
});

describe('percentile and wilson', () => {
  it('take the nearest rank, like voice-parser', () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([5, 1, 4, 2, 3], 95)).toBe(5);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBeUndefined();
  });

  it('gives the 95 % interval of a share, and nothing without cases', () => {
    const rate = wilson(68, 78)!;
    expect(rate.value).toBeCloseTo(0.872, 3);
    // the spike's run B: 87.2 % (CI95 78-93)
    expect(rate.low).toBeCloseTo(0.78, 2);
    expect(rate.high).toBeCloseTo(0.93, 2);
    expect(wilson(0, 0)).toBeNull();
  });
});

describe('summarizeVoice', () => {
  it('counts each recognizer apart, and leaves out those without attempts', () => {
    const summary = summarizeVoice(
      [
        row({ createdAt: new Date('2026-11-20T11:00:00.000Z') }),
        row({ accepted: false }),
        row({ outcome: 'ambiguous', accepted: false }),
        row({ outcome: 'nomatch', accepted: false, silent: true, latency: { recognitionMs: 9000, totalMs: 9000 } }),
        row({ outcome: 'command', accepted: true }),
        row({ recognizer: 'whisper', latency: { recognitionMs: 2900, totalMs: 2950 } }),
      ],
      VOICE_SUMMARY_LIMIT,
    );
    expect(voiceSummaryResponseSchema.parse(summary)).toEqual(summary);
    expect(summary).toMatchObject({ attempts: 6, since: '2026-11-20T10:00:00.000Z', until: '2026-11-20T11:00:00.000Z' });
    expect(summary.recognizers.map((r) => r.recognizer)).toEqual(['webspeech', 'whisper']);
    const webspeech = summary.recognizers[0]!;
    expect(webspeech).toMatchObject({ attempts: 5, silences: 1, outcomes: { move: 2, ambiguous: 1, nomatch: 1, command: 1 }, proposed: 2, confirmed: 1 });
    expect(webspeech.confirmedRate?.value).toBe(0.5);
    // the silence does not count in the times
    expect(webspeech.recognitionMs).toEqual({ p50: 500, p95: 500 });
    expect(summary.recognizers[1]).toMatchObject({ attempts: 1, totalMs: { p50: 2950, p95: 2950 } });
  });

  it('answers an empty summary without attempts', () => {
    expect(summarizeVoice([], 10)).toEqual({ attempts: 0, limit: 10, since: null, until: null, recognizers: [] });
  });

  it('has no rate without proposed moves, and no times with only silences', () => {
    const [only] = summarizeVoice([row({ outcome: 'nomatch', accepted: false, silent: true })], 10).recognizers;
    expect(only).toMatchObject({ proposed: 0, confirmedRate: null, recognitionMs: null, totalMs: null });
  });
});

describe('GET /voice-metrics/summary', () => {
  const recent = jest.fn();
  let app: NestExpressApplication;

  @Global()
  @Module({ providers: [{ provide: VoiceAttemptsRepository, useValue: { recent } }], exports: [VoiceAttemptsRepository] })
  class FakeMongoModule {}

  beforeEach(async () => {
    recent.mockReset().mockResolvedValue([row()]);
    const moduleRef = await Test.createTestingModule({ imports: [FakeMongoModule, VoiceMetricsModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('needs no token, reads at most the limit and answers the contract', async () => {
    const response = await request(app.getHttpServer()).get('/voice-metrics/summary').expect(200);
    expect(recent).toHaveBeenCalledWith(VOICE_SUMMARY_LIMIT);
    expect(voiceSummaryResponseSchema.parse(response.body).recognizers[0]).toMatchObject({ recognizer: 'webspeech', confirmed: 1 });
    expect(JSON.stringify(response.body)).not.toContain('transcript');
  });

  it('answers 503 when Mongo fails', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    recent.mockRejectedValue(new Error('down'));
    await request(app.getHttpServer()).get('/voice-metrics/summary').expect(503);
  });
});
