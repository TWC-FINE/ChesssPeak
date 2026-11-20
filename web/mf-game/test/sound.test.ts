import { describe, expect, it, vi } from 'vitest';
import { saveSoundPreference, soundPreference, TONES, webAudioSound, type ToneContext } from '../src/sound.js';

function fakeContext(state = 'running') {
  const played: Array<{ hz: number; start: number; stop: number }> = [];
  const resume = vi.fn(async () => undefined);
  const context: ToneContext = {
    currentTime: 2,
    state,
    destination: {},
    resume,
    createOscillator() {
      const oscillator = {
        frequency: { value: 0 },
        connect: () => undefined,
        start: (at: number) => played.push({ hz: oscillator.frequency.value, start: at, stop: -1 }),
        stop: (at: number) => {
          played.at(-1)!.stop = at;
        },
      };
      return oscillator;
    },
    createGain: () => ({ gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined }, connect: () => undefined }),
  };
  return { context, played, resume };
}

describe('webAudioSound', () => {
  it('plays a short tone for each kind, lower for a capture', () => {
    const { context, played } = fakeContext();
    const create = vi.fn(() => context);
    const sound = webAudioSound(create);
    sound.play('move');
    sound.play('capture');
    expect(played).toEqual([
      { hz: TONES.move.hz, start: 2, stop: 2 + TONES.move.seconds },
      { hz: TONES.capture.hz, start: 2, stop: 2 + TONES.capture.seconds },
    ]);
    expect(TONES.capture.hz).toBeLessThan(TONES.move.hz);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('wakes a suspended context', () => {
    const { context, resume } = fakeContext('suspended');
    webAudioSound(() => context).play('end');
    expect(resume).toHaveBeenCalled();
  });

  it('stays silent, and only tries once, where there is no WebAudio', () => {
    const create = vi.fn((): ToneContext => {
      throw new ReferenceError('AudioContext is not defined');
    });
    const sound = webAudioSound(create);
    expect(() => sound.play('move')).not.toThrow();
    sound.play('move');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('sound preference', () => {
  it('is on unless it was turned off', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    expect(soundPreference(storage)).toBe(true);
    saveSoundPreference(false, storage);
    expect(soundPreference(storage)).toBe(false);
    saveSoundPreference(true, storage);
    expect(soundPreference(storage)).toBe(true);
  });

  it('survives a browser that refuses the storage', () => {
    const refusing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(soundPreference(refusing)).toBe(true);
    expect(() => saveSoundPreference(false, refusing)).not.toThrow();
    expect(soundPreference(undefined)).toBe(true);
  });
});
