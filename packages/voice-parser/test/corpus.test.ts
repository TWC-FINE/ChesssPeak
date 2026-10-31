import { describe, expect, it } from 'vitest';
import corpusJson from '../corpus/corpus-v0.json';
import { phrasesOfSplit, positionOf, type Corpus } from '../src/corpus.js';
import { legalMovesWithForms, positionFromFen, resolve } from '../src/index.js';

const corpus = corpusJson as Corpus;

describe('corpus v0: structure', () => {
  it('has unique ids and known positions', () => {
    const ids = corpus.phrases.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const phrase of corpus.phrases) expect(() => positionOf(corpus, phrase)).not.toThrow();
  });

  it('splits positions about 70/30 with no position shared', () => {
    const dev = corpus.positions.filter((p) => p.split === 'dev');
    const test = corpus.positions.filter((p) => p.split === 'test');
    expect(dev.length + test.length).toBe(corpus.positions.length);
    expect(dev).toHaveLength(7);
    expect(test).toHaveLength(3);
    const fens = corpus.positions.map((p) => p.fen);
    expect(new Set(fens).size).toBe(fens.length);
  });

  it('has about 40 phrases and 5 noise phrases that must give nomatch', () => {
    expect(corpus.phrases.length).toBeGreaterThanOrEqual(40);
    const noise = corpus.phrases.filter((p) => p.tags.includes('noise'));
    expect(noise).toHaveLength(5);
    for (const phrase of noise) expect(phrase.expectedOutcome).toBe('nomatch');
  });

  it('keeps at least 15 test phrases covering the hard cases', () => {
    const test = phrasesOfSplit(corpus, 'test');
    expect(test.length).toBeGreaterThanOrEqual(15);
    const tags = new Set(test.flatMap((p) => p.tags));
    for (const tag of ['confusable', 'disambiguation', 'castling', 'promotion', 'noise']) {
      expect(tags.has(tag)).toBe(true);
    }
  });

  it('only expects legal moves, in both splits', () => {
    for (const phrase of corpus.phrases) {
      const position = positionOf(corpus, phrase);
      const legal = legalMovesWithForms(positionFromFen(position.fen)).map((m) => m.uci);
      if (phrase.expectedOutcome === 'move') {
        expect(phrase.expectedUci, phrase.id).toBeDefined();
        expect(legal, phrase.id).toContain(phrase.expectedUci);
      } else {
        expect(phrase.expectedUci, phrase.id).toBeUndefined();
      }
    }
  });
});

// The parser is tuned on `dev` only. The `test` split is deliberately NOT run
// through the parser here: it is evaluated once, with real recognizer output,
// by `pnpm metrics`.
describe('corpus v0: dev phrases resolve as expected (spoken text as recognized)', () => {
  const cases = phrasesOfSplit(corpus, 'dev').map((phrase) => {
    const position = positionOf(corpus, phrase);
    return { id: phrase.id, fen: position.fen, spoken: phrase.spoken, phrase };
  });

  it.each(cases)('$id: "$spoken"', ({ fen, spoken, phrase }) => {
    const result = resolve(fen, [{ transcript: spoken }]);
    switch (phrase.expectedOutcome) {
      case 'move':
        expect(result).toMatchObject({ kind: 'move', uci: phrase.expectedUci });
        break;
      case 'command':
        expect(result).toEqual({ kind: 'command', command: phrase.expectedCommand });
        break;
      case 'nomatch':
        expect(result.kind).toBe('nomatch');
        break;
    }
  });
});
