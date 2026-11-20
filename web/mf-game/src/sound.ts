/** What makes a sound: a move, a capture, or the end of the game. */
export type SoundKind = 'move' | 'capture' | 'end';

export interface MoveSound {
  play(kind: SoundKind): void;
}

/** The part of WebAudio this uses, so a test can pass its own. */
export interface ToneContext {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  createOscillator(): { frequency: { value: number }; connect(node: unknown): unknown; start(at: number): void; stop(at: number): void };
  createGain(): { gain: { setValueAtTime(value: number, at: number): void; exponentialRampToValueAtTime(value: number, at: number): void }; connect(node: unknown): unknown };
}

/** Hertz and seconds of each sound: a capture is lower, the end is longer. */
export const TONES: Record<SoundKind, { hz: number; seconds: number }> = {
  move: { hz: 660, seconds: 0.08 },
  capture: { hz: 440, seconds: 0.12 },
  end: { hz: 523, seconds: 0.4 },
};

const VOLUME = 0.15;

/**
 * Short tones made with WebAudio, so there is no file to load. The context is created with the first sound, which
 * comes after a click of the player. Where there is no WebAudio it stays silent: a sound never breaks the game.
 */
export function webAudioSound(create: () => ToneContext = () => new AudioContext() as unknown as ToneContext): MoveSound {
  let context: ToneContext | null | undefined;
  return {
    play(kind) {
      if (context === undefined) {
        try {
          context = create();
        } catch {
          context = null;
        }
      }
      if (context === null) return;
      try {
        if (context.state === 'suspended') void context.resume().catch(() => undefined);
        const { hz, seconds } = TONES[kind];
        const at = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(VOLUME, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + seconds);
      } catch {
        // a sound that fails is only a sound
      }
    },
  };
}

const PREFERENCE_KEY = 'chessspeak.sound';

/** Whether sound is on in this browser; on unless the player turned it off. */
export function soundPreference(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSoundPreference(on: boolean, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(PREFERENCE_KEY, on ? 'on' : 'off');
  } catch {
    // private mode: the choice lasts until the page closes
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
