import type { CsEventDetail } from '@chessspeak/shared';

type Result = CsEventDetail<'cs:game-ended'>['result'];

/** Export lines wrap before 80 characters, as the PGN standard asks. */
const MAX_LINE = 79;

const pad = (value: number): string => String(value).padStart(2, '0');

/** PGN date: YYYY.MM.DD in local time. */
export const pgnDate = (date: Date): string => `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;

/**
 * The game in PGN. `sans` are the moves from ply 1 in order; the result is `*` while the game goes on.
 * The players stay as `?`: mf-history only knows the moves.
 */
export function toPgn(sans: readonly string[], result: Result | undefined, date: Date): string {
  const outcome = result ?? '*';
  const tags = [
    ['Event', 'ChessSpeak'],
    ['Site', 'ChessSpeak'],
    ['Date', pgnDate(date)],
    ['Round', '-'],
    ['White', '?'],
    ['Black', '?'],
    ['Result', outcome],
  ].map(([name, value]) => `[${name} "${value}"]`);

  const tokens = sans.flatMap((san, index) => (index % 2 === 0 ? [`${index / 2 + 1}.`, san] : [san]));
  tokens.push(outcome);
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line === '') line = token;
    else if (line.length + 1 + token.length > MAX_LINE) {
      lines.push(line);
      line = token;
    } else line += ` ${token}`;
  }
  lines.push(line);
  return `${tags.join('\n')}\n\n${lines.join('\n')}\n`;
}

/** File name for the download, e.g. chessspeak-2026-11-20.pgn. */
export const pgnFileName = (date: Date): string => `chessspeak-${pgnDate(date).replaceAll('.', '-')}.pgn`;
