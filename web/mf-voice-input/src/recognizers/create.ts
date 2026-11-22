import { releaseDelayOf, type VoiceInputContext } from '@chessspeak/shared';
import type { SpeechRecognizer } from './recognizer.js';
import { WebSpeechRecognizer } from './web-speech.js';
import { WhisperRecognizer } from './whisper.js';

/** What the player can choose in the selector. `whisper-cloud` is the same recognizer behind the second agent (EC2). */
export type RecognizerChoice = 'webspeech' | 'whisper' | 'whisper-cloud';

/** The recognizer a context asks for, or the one chosen by the player. Undefined when it only uses the text box. */
export function createRecognizer(context: VoiceInputContext | undefined, choice?: RecognizerChoice): SpeechRecognizer | undefined {
  if (context === undefined || context.recognizer === 'text' || context.recognizer === 'fake') return undefined;
  const releaseDelayMs = releaseDelayOf(context);
  const wanted = choice ?? context.recognizer;
  if (wanted === 'whisper' && context.agentUrl !== null) {
    return new WhisperRecognizer({ agentUrl: context.agentUrl, releaseDelayMs });
  }
  if (wanted === 'whisper-cloud' && context.cloudAgentUrl != null) {
    return new WhisperRecognizer({ agentUrl: context.cloudAgentUrl, releaseDelayMs });
  }
  return new WebSpeechRecognizer({ lang: context.lang, releaseDelayMs });
}
