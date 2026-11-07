import { releaseDelayOf, type VoiceInputContext } from '@chessspeak/shared';
import type { SpeechRecognizer } from './recognizer.js';
import { WebSpeechRecognizer } from './web-speech.js';
import { WhisperRecognizer } from './whisper.js';

/** What the player can choose in the selector. */
export type RecognizerChoice = 'webspeech' | 'whisper';

/** The recognizer a context asks for, or the one chosen by the player. Undefined when it only uses the text box. */
export function createRecognizer(context: VoiceInputContext | undefined, choice?: RecognizerChoice): SpeechRecognizer | undefined {
  if (context === undefined || context.recognizer === 'text' || context.recognizer === 'fake') return undefined;
  const releaseDelayMs = releaseDelayOf(context);
  if ((choice ?? context.recognizer) === 'whisper' && context.agentUrl !== null) {
    return new WhisperRecognizer({ agentUrl: context.agentUrl, releaseDelayMs });
  }
  return new WebSpeechRecognizer({ lang: context.lang, releaseDelayMs });
}
