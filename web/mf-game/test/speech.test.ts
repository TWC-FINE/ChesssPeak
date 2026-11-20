import { describe, expect, it, vi } from 'vitest';
import { browserSpeaker, readoutPreference, saveReadoutPreference, spokenSan, type SynthesisLike, type UtteranceConstructor } from '../src/speech.js';

describe('spokenSan', () => {
  it.each([
    ['e4', 'peón e cuatro'],
    ['exd5', 'peón e toma de cinco'],
    ['Nf3', 'caballo efe tres'],
    ['Nbd2', 'caballo be de dos'],
    ['R1a3', 'torre uno a tres'],
    ['Qh4#', 'dama hache cuatro, jaque mate'],
    ['Bxf7+', 'alfil toma efe siete, jaque'],
    ['e8=Q', 'peón e ocho corona dama'],
    ['gxh1=N+', 'peón ge toma hache uno corona caballo, jaque'],
    ['O-O', 'enroque corto'],
    ['O-O-O+', 'enroque largo, jaque'],
    ['Kxe2', 'rey toma e dos'],
  ])('%s → %s', (san, spoken) => {
    expect(spokenSan(san)).toBe(spoken);
  });

  it('returns what is not SAN as it came', () => {
    expect(spokenSan('hola')).toBe('hola');
  });
});

describe('browserSpeaker', () => {
  function fakeSynthesis(voices: Array<{ lang: string }> = [{ lang: 'en-US' }, { lang: 'es-MX' }]) {
    const spoken: Array<{ text: string; lang: string; voice: unknown }> = [];
    const synthesis: SynthesisLike = { cancel: vi.fn(), speak: (utterance) => spoken.push(utterance as never), getVoices: () => voices };
    const Utterance = class {
      lang = '';
      voice: unknown = null;
      constructor(readonly text: string) {}
    } as unknown as UtteranceConstructor;
    return { synthesis, Utterance, spoken };
  }

  it('says the text with a Spanish voice, cutting what was being said', () => {
    const { synthesis, Utterance, spoken } = fakeSynthesis();
    browserSpeaker(() => synthesis, () => Utterance).say('peón e cuatro');
    expect(synthesis.cancel).toHaveBeenCalled();
    expect(spoken).toEqual([expect.objectContaining({ text: 'peón e cuatro', lang: 'es-MX', voice: { lang: 'es-MX' } })]);
  });

  it('asks for Spanish when the browser has no Spanish voice', () => {
    const { synthesis, Utterance, spoken } = fakeSynthesis([{ lang: 'en-US' }]);
    browserSpeaker(() => synthesis, () => Utterance).say('e4');
    expect(spoken[0]?.lang).toBe('es-CO');
  });

  it('stays silent without speech synthesis', () => {
    expect(() => browserSpeaker(() => undefined, () => undefined).say('e4')).not.toThrow();
  });
});

describe('readout preference', () => {
  it('is on unless it was turned off', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    expect(readoutPreference(storage)).toBe(true);
    saveReadoutPreference(false, storage);
    expect(readoutPreference(storage)).toBe(false);
  });
});
