const GLYPHS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

/** Render the piece placement of a FEN as a small HTML board (white at the bottom). */
export function renderBoard(fen: string): string {
  const placement = fen.split(' ')[0] ?? '';
  const rows = placement.split('/');
  let html = '<div class="board" aria-label="Tablero">';
  rows.forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      const empty = Number(ch);
      if (Number.isInteger(empty) && empty > 0) {
        for (let i = 0; i < empty; i++) html += cell(r, file++, '');
      } else {
        html += cell(r, file++, GLYPHS[ch] ?? '?');
      }
    }
  });
  return `${html}</div>`;
}

function cell(row: number, file: number, glyph: string): string {
  const dark = (row + file) % 2 === 1;
  return `<span class="sq ${dark ? 'dark' : 'light'}">${glyph}</span>`;
}

export function sideToMove(fen: string): string {
  return fen.split(' ')[1] === 'b' ? 'negras' : 'blancas';
}
