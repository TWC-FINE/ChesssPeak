import type { Command } from './types.js';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export type PieceRole = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export const PIECE_WORD: Record<PieceRole, string> = {
  pawn: 'peon',
  knight: 'caballo',
  bishop: 'alfil',
  rook: 'torre',
  queen: 'dama',
  king: 'rey',
};

const PIECE_WORDS = new Set(Object.values(PIECE_WORD));

/** Spoken word (already lowercase, without accents) -> canonical token. */
const WORDS: Record<string, string> = {
  // pieces
  peon: 'peon',
  caballo: 'caballo',
  alfil: 'alfil',
  torre: 'torre',
  dama: 'dama',
  reina: 'dama',
  rey: 'rey',
  // file letters, with the common ways of saying them
  a: 'a',
  ah: 'a',
  b: 'b',
  be: 'b',
  ve: 'b',
  c: 'c',
  ce: 'c',
  se: 'c',
  d: 'd',
  de: 'd',
  e: 'e',
  f: 'f',
  efe: 'f',
  fe: 'f',
  g: 'g',
  ge: 'g',
  je: 'g',
  h: 'h',
  hache: 'h',
  ache: 'h',
  // ranks
  uno: '1',
  una: '1',
  dos: '2',
  tres: '3',
  cuatro: '4',
  cinco: '5',
  seis: '6',
  siete: '7',
  ocho: '8',
  // markers
  toma: 'toma',
  tomo: 'toma',
  tomando: 'toma',
  captura: 'toma',
  come: 'toma',
  x: 'toma',
  corona: 'corona',
  coronando: 'corona',
  promueve: 'corona',
  promociona: 'corona',
  promocion: 'corona',
  enroque: 'enroque',
  enroca: 'enroque',
  corto: 'corto',
  chico: 'corto',
  largo: 'largo',
  grande: 'largo',
  // commands
  si: 'cmd:yes',
  confirmo: 'cmd:yes',
  confirmar: 'cmd:yes',
  vale: 'cmd:yes',
  no: 'cmd:no',
  cancelar: 'cmd:cancel',
  cancela: 'cmd:cancel',
  cancelo: 'cmd:cancel',
  atras: 'cmd:cancel',
};

export const NATO: Record<string, string> = {
  alfa: 'a',
  bravo: 'b',
  charlie: 'c',
  delta: 'd',
  eco: 'e',
  foxtrot: 'f',
  golf: 'g',
  hotel: 'h',
};

const COMMANDS: Record<string, Command> = {
  'cmd:yes': 'yes',
  'cmd:no': 'no',
  'cmd:cancel': 'cancel',
};

export type TokenClass = 'file' | 'rank' | 'piece' | 'marker' | 'command' | 'unknown';

const FILE_SET = new Set<string>(FILES);
const RANK_SET = new Set<string>(RANKS);
const MARKER_SET = new Set(['toma', 'corona', 'enroque', 'corto', 'largo']);

export function lookupWord(word: string, nato: boolean): string | undefined {
  return WORDS[word] ?? (nato ? NATO[word] : undefined);
}

export function tokenClass(token: string): TokenClass {
  if (FILE_SET.has(token)) return 'file';
  if (RANK_SET.has(token)) return 'rank';
  if (PIECE_WORDS.has(token)) return 'piece';
  if (MARKER_SET.has(token)) return 'marker';
  if (token in COMMANDS) return 'command';
  return 'unknown';
}

export function commandOf(token: string): Command | undefined {
  return COMMANDS[token];
}

export function isPieceWord(token: string): boolean {
  return PIECE_WORDS.has(token);
}

export function isFile(token: string): boolean {
  return FILE_SET.has(token);
}
