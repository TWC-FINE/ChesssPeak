import { isFile, isPieceWord, lookupWord } from './lexicon.js';

/** Lowercase, strip accents, turn punctuation into spaces and split letter/digit boundaries. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .trim();
}

/**
 * Turn a recognized phrase into canonical tokens: pieces, files `a`-`h`, ranks `1`-`8`,
 * markers (`toma`, `corona`, `enroque`, `corto`, `largo`) and commands (`cmd:*`).
 * Words that are not in the lexicon are kept as they are.
 */
export function tokenize(text: string, opts: { nato?: boolean } = {}): string[] {
  const nato = opts.nato ?? false;
  const out: string[] = [];
  for (const word of normalizeText(text).split(' ')) {
    if (word === '') continue;
    const known = lookupWord(word, nato);
    if (known !== undefined) {
      out.push(known);
    } else if (/^[a-h]x[a-h]$/.test(word)) {
      // "exd" written as one word
      out.push(word[0]!, 'toma', word[2]!);
    } else {
      out.push(word);
    }
  }
  return expandFilePairs(out);
}

/** "torre ad 1": a two-letter token between a piece and a rank is two files ("a", "d"). */
function expandFilePairs(tokens: string[]): string[] {
  const out: string[] = [];
  tokens.forEach((token, i) => {
    const prev = tokens[i - 1];
    if (/^[a-h]{2}$/.test(token) && prev !== undefined && (isPieceWord(prev) || isFile(prev))) {
      out.push(token[0]!, token[1]!);
    } else {
      out.push(token);
    }
  });
  return out;
}
