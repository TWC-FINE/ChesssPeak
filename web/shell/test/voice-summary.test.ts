import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api.js';
import { fetchVoiceSummary, latencyText, percentText, rateText } from '../src/voice-summary.js';

const summary = { attempts: 0, limit: 5000, since: null, until: null, recognizers: [] };
const answering = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

describe('fetchVoiceSummary', () => {
  it('reads GET /voice-metrics/summary without a token', async () => {
    const fetcher = answering(200, summary);
    await expect(fetchVoiceSummary('http://api', fetcher)).resolves.toEqual(summary);
    expect((fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toEqual(['http://api/voice-metrics/summary']);
  });

  it('turns a server error and a reply outside the contract into a message', async () => {
    await expect(fetchVoiceSummary('http://api', answering(503))).rejects.toThrow('telemetría');
    await expect(fetchVoiceSummary('http://api', answering(200, { attempts: -1 }))).rejects.toBeInstanceOf(ApiError);
  });
});

describe('texts', () => {
  it('writes shares and times with a decimal comma', () => {
    expect(percentText(0.872)).toBe('87,2 %');
    expect(rateText({ value: 0.872, low: 0.78, high: 0.93 })).toBe('87,2 % (IC95 78,0–93,0)');
    expect(rateText(null)).toBe('—');
    expect(latencyText({ p50: 570, p95: 620 })).toBe('0,57 / 0,62 s');
    expect(latencyText(null)).toBe('—');
  });
});
