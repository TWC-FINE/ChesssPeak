import { Chess, castlingSide } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import type { Move, Role, Square } from 'chessops/types';
import { makeUci, squareFile, squareRank } from 'chessops/util';
import { FILES, PIECE_WORD, type PieceRole } from './lexicon.js';

export interface LegalMove {
  uci: string;
  san: string;
  /** Ways of saying this move, as canonical token sequences. */
  forms: string[][];
}

const PROMOTION_ROLES: Role[] = ['queen', 'rook', 'bishop', 'knight'];

const file = (sq: Square): string => FILES[squareFile(sq)]!;
const rank = (sq: Square): string => String(squareRank(sq) + 1);
const squareTokens = (sq: Square): string[] => [file(sq), rank(sq)];

export function positionFromFen(fen: string): Chess {
  const setup = parseFen(fen).unwrap();
  return Chess.fromSetup(setup).unwrap();
}

/** Every legal move of the position with its spoken forms. */
export function legalMovesWithForms(pos: Chess): LegalMove[] {
  const ctx = pos.ctx();
  const moves: Move[] = [];
  for (const [from, tos] of pos.allDests(ctx)) {
    const piece = pos.board.get(from)!;
    for (const to of tos) {
      const lastRank = squareRank(to) === 0 || squareRank(to) === 7;
      if (piece.role === 'pawn' && lastRank) {
        for (const promotion of PROMOTION_ROLES) moves.push({ from, to, promotion });
      } else {
        moves.push({ from, to });
      }
    }
  }

  const result: LegalMove[] = [];
  for (const move of moves) {
    result.push({
      uci: makeStandardUci(pos, move),
      san: makeSan(pos, move),
      forms: formsFor(pos, move, moves),
    });
  }
  return result;
}

/** chessops encodes castling as "king takes rook" (e1h1); UCI for standard chess wants e1g1. */
function castlingKingDestination(from: Square, side: 'a' | 'h'): Square {
  const targetFile = side === 'h' ? 6 : 2;
  return squareRank(from) * 8 + targetFile;
}

function makeStandardUci(pos: Chess, move: Move): string {
  const side = 'from' in move ? castlingSide(pos, move) : undefined;
  if (side === undefined || !('from' in move)) return makeUci(move);
  return makeUci({ from: move.from, to: castlingKingDestination(move.from, side) });
}

function formsFor(pos: Chess, move: Move, all: Move[]): string[][] {
  if (!('from' in move)) return [];
  const piece = pos.board.get(move.from)!;
  const side = castlingSide(pos, move);

  if (side !== undefined) {
    const word = side === 'h' ? 'corto' : 'largo';
    const kingTo = castlingKingDestination(move.from, side);
    return [['enroque', word], [...squareTokens(move.from), ...squareTokens(kingTo)]];
  }

  const from = move.from;
  const to = move.to;
  const capture =
    pos.board.has(to) || (piece.role === 'pawn' && squareFile(from) !== squareFile(to));
  const toTokens = squareTokens(to);
  const coordinates = [...squareTokens(from), ...toTokens];
  const base: string[][] = [coordinates];

  if (piece.role === 'pawn') {
    if (capture) {
      base.push(
        [file(from), 'toma', ...toTokens],
        ['peon', file(from), 'toma', ...toTokens],
        [file(from), ...toTokens],
      );
    } else {
      base.push(toTokens, ['peon', ...toTokens]);
    }
  } else {
    const word = PIECE_WORD[piece.role as PieceRole];
    const rivals = all.filter(
      (m) =>
        'from' in m &&
        m.to === to &&
        m.from !== from &&
        pos.board.get(m.from)?.role === piece.role,
    );
    const hints: string[][] = [[]];
    if (rivals.length > 0) {
      hints.push([file(from)], [rank(from)], squareTokens(from));
    }
    for (const hint of hints) {
      base.push([word, ...hint, ...(capture ? ['toma'] : []), ...toTokens]);
    }
  }

  if (move.promotion === undefined) return unique(base);

  const promoWord = PIECE_WORD[move.promotion as PieceRole];
  const withPromotion: string[][] = [];
  for (const form of base) {
    withPromotion.push([...form, 'corona', promoWord], [...form, promoWord]);
  }
  return unique(withPromotion);
}

function unique(forms: string[][]): string[][] {
  const seen = new Set<string>();
  return forms.filter((form) => {
    const key = form.join(' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
