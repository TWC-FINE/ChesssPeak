import { tokenClass } from './lexicon.js';

const MARKER_COST = 0.3;
const FILLER_A_COST = 0.3;
const UNKNOWN_DELETE_COST = 0.5;
const EDGE_FILLER_COST = 0.25;

/**
 * Pairs of canonical tokens that speech recognizers tend to mix up, with the
 * substitution cost (1 = unrelated, 0 = identical). Letter names that rhyme in
 * Spanish (be, ce, de, e, ge) are the main source of trouble.
 */
const CONFUSION = new Map<string, number>();

function confuse(group: string[], cost: number): void {
  for (const a of group) {
    for (const b of group) {
      if (a !== b) CONFUSION.set(`${a}|${b}`, cost);
    }
  }
}

confuse(['b', 'c', 'd', 'e', 'g'], 0.4);
confuse(['a', 'h'], 0.5);
confuse(['e', 'f'], 0.5);
confuse(['3', '6'], 0.5);

const PIECE_NAMES = ['peon', 'caballo', 'alfil', 'torre', 'dama', 'rey'];

/** Two words close enough to be a mispronunciation of one another ("cavayo" / "caballo"). */
function similarWords(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  return levenshtein(a, b) <= Math.floor(0.45 * Math.max(a.length, b.length));
}

/** An unknown word that is probably a garbled piece name: dropping it would change the move. */
function looksLikePiece(token: string): boolean {
  return tokenClass(token) === 'unknown' && PIECE_NAMES.some((name) => similarWords(token, name));
}

/** Cost of a recognized token that the expected phrase does not have. */
export function deleteCost(token: string): number {
  if (token === 'a') return FILLER_A_COST; // usually the preposition: "caballo a f3"
  if (token === 'peon' || tokenClass(token) === 'marker') return MARKER_COST;
  if (tokenClass(token) === 'unknown') return looksLikePiece(token) ? 1 : UNKNOWN_DELETE_COST;
  return 1;
}

/** Cost of an expected token that the recognized phrase does not have. */
export function insertCost(token: string): number {
  if (token === 'peon' || tokenClass(token) === 'marker') return MARKER_COST;
  return 1;
}

export function substituteCost(recognized: string, expected: string): number {
  if (recognized === expected) return 0;
  const confusion = CONFUSION.get(`${recognized}|${expected}`);
  if (confusion !== undefined) return confusion;
  // a misspelled or mispronounced word ("cabayo" for "caballo")
  if (tokenClass(recognized) === 'unknown' && similarWords(recognized, expected)) {
    const lev = levenshtein(recognized, expected);
    return Math.min(1, (1.2 * lev) / Math.max(recognized.length, expected.length));
  }
  return 1;
}

/** Unknown words before or after the move ("pues caballo ge cinco por favor") are cheap. */
function edgeDeleteCost(token: string): number {
  return tokenClass(token) === 'unknown' && !looksLikePiece(token)
    ? EDGE_FILLER_COST
    : deleteCost(token);
}

/** Weighted token edit distance between a recognized phrase and an expected spoken form. */
export function weightedDistance(recognized: string[], expected: string[]): number {
  const rows = recognized.length + 1;
  const cols = expected.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i++) d[i]![0] = d[i - 1]![0]! + edgeDeleteCost(recognized[i - 1]!);
  for (let j = 1; j < cols; j++) d[0]![j] = d[0]![j - 1]! + insertCost(expected[j - 1]!);
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      d[i]![j] = Math.min(
        d[i - 1]![j - 1]! + substituteCost(recognized[i - 1]!, expected[j - 1]!),
        d[i - 1]![j]! + deleteCost(recognized[i - 1]!),
        d[i]![j - 1]! + insertCost(expected[j - 1]!),
      );
    }
  }
  // the phrase may end with trailing filler words
  let best = Infinity;
  let trailing = 0;
  for (let i = rows - 1; i >= 0; i--) {
    best = Math.min(best, d[i]![cols - 1]! + trailing);
    if (i === 0 || tokenClass(recognized[i - 1]!) !== 'unknown') break;
    trailing += edgeDeleteCost(recognized[i - 1]!);
  }
  return best;
}

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}
