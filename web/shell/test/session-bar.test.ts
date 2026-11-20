import { describe, expect, it } from 'vitest';
import { clockMinutesOf, incrementSecondsOf } from '../src/session-bar.js';

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

describe('incrementSecondsOf', () => {
  it('reads the seconds the contract offers', () => {
    expect(incrementSecondsOf('2')).toBe(2);
    expect(incrementSecondsOf('3')).toBe(3);
    expect(incrementSecondsOf('5')).toBe(5);
  });

  it('means no increment for +0 s and for anything else', () => {
    expect(incrementSecondsOf('0')).toBeUndefined();
    expect(incrementSecondsOf('')).toBeUndefined();
    expect(incrementSecondsOf('4')).toBeUndefined();
  });
});
