/**
 * Vocabulary prompt: Whisper conditions its decoding on it, which helps with
 * piece names and the spoken letters. It is a fixed string, not tuned on `test`.
 */
export const CHESS_PROMPT =
  'Partida de ajedrez. Jugadas dichas en español: peón, caballo, alfil, torre, dama, rey, toma, ' +
  'enroque corto, enroque largo, corona a dama. Columnas: a, be, ce, de, e, efe, ge, hache. ' +
  'Filas: uno, dos, tres, cuatro, cinco, seis, siete, ocho. Por ejemplo: caballo efe tres, e cuatro, alfil toma efe siete.';
