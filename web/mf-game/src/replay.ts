import { Chess, normalizeMove } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';

/**
 * The FEN after each move, from the start. game:state does not carry them, and cs:move-applied needs one per move.
 * Stops at a move that cannot be played: the server already validated them, so that would mean damaged data.
 */
export function fensAfter(moves: ReadonlyArray<{ uci: string }>): string[] {
  const position = Chess.default();
  const fens: string[] = [];
  for (const { uci } of moves) {
    const parsed = parseUci(uci);
    if (parsed === undefined) break;
    const move = normalizeMove(position, parsed);
    if (!position.isLegal(move)) break;
    position.play(move);
    fens.push(makeFen(position.toSetup()));
  }
  return fens;
}

export function turnOf(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}
