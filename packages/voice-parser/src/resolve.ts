import { weightedDistance } from './distance.js';
import { commandOf } from './lexicon.js';
import { tokenize } from './normalize.js';
import { legalMovesWithForms, positionFromFen } from './spoken-forms.js';
import {
  DEFAULT_OPTIONS,
  type Alternative,
  type Candidate,
  type Command,
  type Resolution,
  type ResolveOptions,
} from './types.js';

const EPSILON = 1e-9;
const MAX_CANDIDATES = 3;

/** A command is the whole utterance (ignoring a filler "a"): "si", "no", "cancelar". */
function asCommand(tokens: string[]): Command | undefined {
  const meaningful = tokens.filter((t) => t !== 'a');
  if (meaningful.length !== 1) return undefined;
  return commandOf(meaningful[0]!);
}

/**
 * Pick the legal move whose spoken form is closest to what was recognized.
 * `alternatives` is the recognizer's N-best list, best first; pass a single
 * element to ignore the extra alternatives.
 */
export function resolve(
  fen: string,
  alternatives: Alternative[],
  options: ResolveOptions = {},
): Resolution {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const heard = alternatives
    .map((alt) => tokenize(alt.transcript, { nato: opts.nato }))
    .filter((tokens) => tokens.length > 0);

  if (heard.length === 0) return { kind: 'nomatch', candidates: [] };

  const firstCommand = asCommand(heard[0]!);
  if (firstCommand !== undefined) return { kind: 'command', command: firstCommand };

  const moves = legalMovesWithForms(positionFromFen(fen));
  const ranked: Candidate[] = moves
    .map((move) => {
      let best = Infinity;
      heard.forEach((tokens, rank) => {
        for (const form of move.forms) {
          best = Math.min(best, weightedDistance(tokens, form) + rank * opts.rankPenalty);
        }
      });
      return { uci: move.uci, san: move.san, distance: best };
    })
    .sort((a, b) => a.distance - b.distance);

  const candidates = ranked.slice(0, MAX_CANDIDATES);
  const best = ranked[0];
  if (best === undefined || best.distance > opts.threshold + EPSILON) {
    for (const tokens of heard.slice(1)) {
      const command = asCommand(tokens);
      if (command !== undefined) return { kind: 'command', command };
    }
    return { kind: 'nomatch', candidates };
  }

  const close = ranked.filter((c) => c.distance - best.distance < opts.margin - EPSILON);
  if (close.length > 1) return { kind: 'ambiguous', candidates: close.slice(0, MAX_CANDIDATES) };

  return { kind: 'move', uci: best.uci, san: best.san, distance: best.distance, candidates };
}
