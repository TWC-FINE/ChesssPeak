import { readdirSync } from 'node:fs';
import type { Condition } from '@chessspeak/voice-parser';

export interface ClipName {
  file: string;
  /** null for silence / noise clips */
  phraseId: string | null;
  condition: Condition;
  repetition: number;
  /** true when the file name carries `.fake.` (synthetic audio, never evidence) */
  fake: boolean;
}

// matches the names written by spike/web-speech: p05-01_noisy_r2_runB.wav, trial_silence_r3_runB.wav
// (the `_runA`/`_runB` part is optional: older clips do not carry the run)
const NAME = /^(.+?)_(quiet|noisy|silence|noise)_r(\d+)(?:_run[A-Za-z0-9]+)?(\.fake)?\.wav$/i;

export function parseClipName(file: string): ClipName | undefined {
  const match = NAME.exec(file);
  if (match === null) return undefined;
  const [, base, condition, repetition, fake] = match;
  return {
    file,
    phraseId: base === 'trial' ? null : base!,
    condition: condition!.toLowerCase() as Condition,
    repetition: Number(repetition),
    fake: fake !== undefined,
  };
}

export function listClips(dir: string): { clips: ClipName[]; ignored: string[] } {
  const clips: ClipName[] = [];
  const ignored: string[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.toLowerCase().endsWith('.wav')) continue;
    const clip = parseClipName(file);
    if (clip === undefined) ignored.push(file);
    else clips.push(clip);
  }
  return { clips, ignored };
}
