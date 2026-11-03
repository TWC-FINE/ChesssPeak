import type { Command } from './types.js';

export type Split = 'dev' | 'test';
export type ExpectedOutcome = 'move' | 'command' | 'nomatch';

export interface CorpusPosition {
  id: string;
  split: Split;
  fen: string;
  description: string;
}

export interface CorpusPhrase {
  id: string;
  positionId: string;
  /** What the speaker is asked to say, in natural speech. */
  spoken: string;
  expectedOutcome: ExpectedOutcome;
  expectedUci?: string;
  expectedCommand?: Command;
  tags: string[];
}

export interface Corpus {
  version: string;
  language: string;
  positions: CorpusPosition[];
  phrases: CorpusPhrase[];
}

export function positionOf(corpus: Corpus, phrase: CorpusPhrase): CorpusPosition {
  const position = corpus.positions.find((p) => p.id === phrase.positionId);
  if (position === undefined) throw new Error(`Unknown position ${phrase.positionId}`);
  return position;
}

export function phrasesOfSplit(corpus: Corpus, split: Split): CorpusPhrase[] {
  return corpus.phrases.filter((phrase) => positionOf(corpus, phrase).split === split);
}
