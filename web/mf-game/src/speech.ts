import { saveSwitchPreference, switchPreference } from './sound.js';

const FILE_WORD: Record<string, string> = { a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e', f: 'efe', g: 'ge', h: 'hache' };
const RANK_WORD: Record<string, string> = { '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro', '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho' };
const PIECE_WORD: Record<string, string> = { K: 'rey', Q: 'dama', R: 'torre', B: 'alfil', N: 'caballo' };

/**
 * A move in SAN as it is said in Spanish, the same way players say it to the board: "Nxf3+" is
 * "caballo toma efe tres, jaque". Anything that is not SAN is returned as it came.
 */
export function spokenSan(san: string): string {
  const check = san.endsWith('#') ? ', jaque mate' : san.endsWith('+') ? ', jaque' : '';
  const body = san.replace(/[+#]$/, '');
  if (body === 'O-O') return `enroque corto${check}`;
  if (body === 'O-O-O') return `enroque largo${check}`;
  const parts = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h])([1-8])(?:=([QRBN]))?$/.exec(body);
  if (parts === null) return san;
  const [, piece, fromFile, fromRank, capture, toFile, toRank, promotion] = parts;
  const words = [piece === undefined ? 'peón' : PIECE_WORD[piece]!];
  if (fromFile !== undefined) words.push(FILE_WORD[fromFile]!);
  if (fromRank !== undefined) words.push(RANK_WORD[fromRank]!);
  if (capture !== undefined) words.push('toma');
  words.push(FILE_WORD[toFile!]!, RANK_WORD[toRank!]!);
  if (promotion !== undefined) words.push('corona', PIECE_WORD[promotion]!);
  return `${words.join(' ')}${check}`;
}

export interface MoveSpeaker {
  say(text: string): void;
}

/** The part of the Web Speech synthesis this uses, so a test can pass its own. */
export interface SynthesisLike {
  cancel(): void;
  speak(utterance: unknown): void;
  getVoices(): ReadonlyArray<{ lang: string }>;
}
export type UtteranceConstructor = new (text: string) => { lang: string; voice: unknown };

/**
 * Says a text with the voice of the browser, in Spanish when it has one. A new text cuts the one being said: only
 * the last move matters. Where there is no synthesis it stays silent.
 */
export function browserSpeaker(
  synthesis: () => SynthesisLike | undefined = () => (globalThis as { speechSynthesis?: SynthesisLike }).speechSynthesis,
  Utterance: () => UtteranceConstructor | undefined = () => (globalThis as { SpeechSynthesisUtterance?: UtteranceConstructor }).SpeechSynthesisUtterance,
): MoveSpeaker {
  return {
    say(text) {
      const engine = synthesis();
      const Make = Utterance();
      if (engine === undefined || Make === undefined) return;
      try {
        engine.cancel();
        const utterance = new Make(text);
        const voice = engine.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith('es'));
        utterance.lang = voice?.lang ?? 'es-CO';
        if (voice !== undefined) utterance.voice = voice;
        engine.speak(utterance);
      } catch {
        // a move not read aloud is still on the board
      }
    },
  };
}

const READOUT_KEY = 'chessspeak.readout';

/** Whether the moves of the rival are read aloud in this browser; on unless the player turned it off. */
export const readoutPreference = (storage?: Pick<Storage, 'getItem'>): boolean =>
  storage === undefined ? switchPreference(READOUT_KEY) : switchPreference(READOUT_KEY, storage);

export const saveReadoutPreference = (on: boolean, storage?: Pick<Storage, 'setItem'>): void =>
  storage === undefined ? saveSwitchPreference(READOUT_KEY, on) : saveSwitchPreference(READOUT_KEY, on, storage);
