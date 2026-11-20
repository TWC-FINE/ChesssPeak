import { describe, expect, it } from 'vitest';
import { clockMinutesOf } from '../src/session-bar.js';

describe('clockMinutesOf', () => {
  it('reads the minutes the contract offers', () => {
    expect(clockMinutesOf('3')).toBe(3);
    expect(clockMinutesOf('5')).toBe(5);
    expect(clockMinutesOf('10')).toBe(10);
  });

  it('means no clock for "Sin reloj" and for anything else', () => {
    expect(clockMinutesOf('')).toBeUndefined();
    expect(clockMinutesOf('7')).toBeUndefined();
    expect(clockMinutesOf('5min')).toBeUndefined();
  });
});
