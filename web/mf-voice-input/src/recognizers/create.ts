import { releaseDelayOf, type VoiceInputContext } from '@chessspeak/shared';
import type { SpeechRecognizer } from './recognizer.js';
import { WebSpeechRecognizer } from './web-speech.js';

/** The recognizer a context asks for, or undefined when it only uses the text box. */
export function createRecognizer(context: VoiceInputContext | undefined): SpeechRecognizer | undefined {
  if (context?.recognizer !== 'webspeech') return undefined;
  return new WebSpeechRecognizer({ lang: context.lang, releaseDelayMs: releaseDelayOf(context) });
}
