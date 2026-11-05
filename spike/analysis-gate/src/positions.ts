import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parsePgn } from 'chessops/pgn';
import { parseSan } from 'chessops/san';

export interface GamePosition {
  ply: number;
  san: string;
  fen: string;
}

/** The position after each move of the first game of a PGN. Throws on an illegal move, so a bad fixture cannot pass. */
export function positionsFromPgn(pgn: string): GamePosition[] {
  const game = parsePgn(pgn)[0];
  if (game === undefined) throw new Error('El PGN no contiene ninguna partida');
  const position = Chess.default();
  const positions: GamePosition[] = [];
  for (const node of game.moves.mainline()) {
    const move = parseSan(position, node.san);
    if (move === undefined) throw new Error(`Jugada ilegal en la media jugada ${positions.length + 1}: ${node.san}`);
    position.play(move);
    positions.push({ ply: positions.length + 1, san: node.san, fen: makeFen(position.toSetup()) });
  }
  return positions;
}
