/** docs/analysis-criteria.md, section 7. */
export const MATE_VALUE = 10_000;

export interface InfoLine {
  depth: number;
  /** Centipawns from the side to move's point of view; a mate counts as ±MATE_VALUE. */
  score: number;
}

/** Reads the depth and score of a UCI `info` line; undefined for any line that lacks them. */
export function parseInfo(line: string): InfoLine | undefined {
  const depth = /^info\b.*?\bdepth (\d+)/.exec(line)?.[1];
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  if (depth === undefined || score === null) return undefined;
  const value = Number(score[2]);
  if (score[1] === 'cp') return { depth: Number(depth), score: value };
  // "mate 0" means that the side to move is already mated
  return { depth: Number(depth), score: value > 0 ? MATE_VALUE : -MATE_VALUE };
}

/** UCI scores are relative to the side to move; the criteria compare them from White's point of view. */
export function toWhitePov(score: number, fen: string): number {
  const blackToMove = fen.split(' ')[1] === 'b';
  // avoids -0, which would serialize and compare confusingly
  return blackToMove && score !== 0 ? -score : score;
}

export function parseBestMove(line: string): string | undefined {
  return /^bestmove (\S+)/.exec(line)?.[1];
}

/** Parses `tasklist /FO CSV /NH`: "image","pid","session","session#","1.234 KB" (the memory column is localised). */
export function parseTasklist(output: string): Map<number, number> {
  const rss = new Map<number, number>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^"[^"]*","(\d+)","[^"]*","[^"]*","([^"]*)"/.exec(line);
    if (match === null) continue;
    const kilobytes = Number(match[2]!.replace(/\D/g, ''));
    if (Number.isFinite(kilobytes)) rss.set(Number(match[1]), kilobytes * 1024);
  }
  return rss;
}
