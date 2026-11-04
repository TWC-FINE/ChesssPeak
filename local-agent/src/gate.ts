import { parseWav } from './wav-read.js';

export interface GateConfig {
  minDurationMs: number;
  minRmsDbfs: number;
}

/** Fixed for the spike (docs/spike-notes.md); do not tune on the test split. */
export const DEFAULT_GATE: GateConfig = { minDurationMs: 300, minRmsDbfs: -50 };

export interface Measurement {
  durationMs: number;
  /** RMS level of the whole clip in dB relative to full scale (-Infinity for pure digital silence). */
  rmsDbfs: number;
}

export type GateReason = 'too-short' | 'too-quiet';

export interface GateResult extends Measurement {
  pass: boolean;
  reason?: GateReason;
}

export function measureWav(bytes: Uint8Array): Measurement {
  const { samples, durationMs } = parseWav(bytes);
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
  return { durationMs, rmsDbfs: rms === 0 ? -Infinity : 20 * Math.log10(rms) };
}

/** Clips that are too short or too quiet are not worth sending to Whisper (it invents text for silence). */
export function applyGate(bytes: Uint8Array, config: GateConfig = DEFAULT_GATE): GateResult {
  const measurement = measureWav(bytes);
  if (measurement.durationMs < config.minDurationMs) return { ...measurement, pass: false, reason: 'too-short' };
  if (measurement.rmsDbfs < config.minRmsDbfs) return { ...measurement, pass: false, reason: 'too-quiet' };
  return { ...measurement, pass: true };
}

export function gateFromEnv(env: Record<string, string>): GateConfig {
  const number = (key: string, fallback: number): number => {
    const value = Number(env[key]);
    return env[key] === undefined || env[key] === '' || Number.isNaN(value) ? fallback : value;
  };
  return {
    minDurationMs: number('MIN_DURATION_MS', DEFAULT_GATE.minDurationMs),
    minRmsDbfs: number('MIN_RMS_DBFS', DEFAULT_GATE.minRmsDbfs),
  };
}
