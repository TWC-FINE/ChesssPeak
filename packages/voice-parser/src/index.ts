export { resolve } from './resolve.js';
export { tokenize, normalizeText } from './normalize.js';
export { weightedDistance } from './distance.js';
export { legalMovesWithForms, positionFromFen, type LegalMove } from './spoken-forms.js';
export {
  DEFAULT_OPTIONS,
  type Alternative,
  type Candidate,
  type Command,
  type Resolution,
  type ResolveOptions,
} from './types.js';
export { phrasesOfSplit, positionOf } from './corpus.js';
export type {
  Corpus,
  CorpusPhrase,
  CorpusPosition,
  ExpectedOutcome,
  Split,
} from './corpus.js';
export type {
  AttemptLatency,
  AttemptRecord,
  Condition,
  ResultsFile,
  ResultsMeta,
} from './results.js';
