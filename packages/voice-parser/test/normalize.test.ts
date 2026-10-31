import { describe, expect, it } from 'vitest';
import { normalizeText, tokenize } from '../src/index.js';

describe('normalizeText', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeText('  ¡Peón, E-4!  ')).toBe('peon e 4');
  });

  it('splits letters from digits', () => {
    expect(normalizeText('Nf3 e2e4')).toBe('nf 3 e 2 e 4');
  });
});

describe('tokenize', () => {
  it('turns number words into digits', () => {
    expect(tokenize('e cuatro')).toEqual(['e', '4']);
    expect(tokenize('Siete')).toEqual(['7']);
  });

  it('maps letter aliases to the same file', () => {
    expect(tokenize('be ve')).toEqual(['b', 'b']);
    expect(tokenize('ce se')).toEqual(['c', 'c']);
    expect(tokenize('ge je')).toEqual(['g', 'g']);
    expect(tokenize('efe hache')).toEqual(['f', 'h']);
  });

  it('keeps coordinates written as one word', () => {
    expect(tokenize('e2e4')).toEqual(['e', '2', 'e', '4']);
    expect(tokenize('E2 E4')).toEqual(['e', '2', 'e', '4']);
  });

  it('maps piece synonyms, markers and castling words', () => {
    expect(tokenize('reina toma')).toEqual(['dama', 'toma']);
    expect(tokenize('enroque chico')).toEqual(['enroque', 'corto']);
    expect(tokenize('enroque grande')).toEqual(['enroque', 'largo']);
    expect(tokenize('coronando a dama')).toEqual(['corona', 'a', 'dama']);
  });

  it('splits "exd5" and "ad1" after a piece', () => {
    expect(tokenize('exd5')).toEqual(['e', 'toma', 'd', '5']);
    expect(tokenize('torre ad1')).toEqual(['torre', 'a', 'd', '1']);
  });

  it('does not turn ordinary two-letter words into files', () => {
    expect(tokenize('he dicho')).toEqual(['he', 'dicho']);
  });

  it('maps commands', () => {
    expect(tokenize('sí')).toEqual(['cmd:yes']);
    expect(tokenize('Cancelar')).toEqual(['cmd:cancel']);
  });

  it('only understands the NATO alphabet when enabled', () => {
    expect(tokenize('caballo foxtrot tres')).toEqual(['caballo', 'foxtrot', '3']);
    expect(tokenize('caballo foxtrot tres', { nato: true })).toEqual(['caballo', 'f', '3']);
  });
});
