import './mf-voice-input.js';
import type { VoiceInputContext } from '@chessspeak/shared';

const element = document.getElementById('mf');
const log = document.getElementById('log');
if (element !== null) {
  const context: VoiceInputContext = { v: 1, lang: 'es-CO', recognizer: 'webspeech', releaseDelayMs: 400 };
  (element as HTMLElement & { context: VoiceInputContext }).context = context;
  element.addEventListener('cs:mf-ready', (event) => {
    if (log !== null) log.textContent += `${event.type} ${JSON.stringify((event as CustomEvent).detail)}\n`;
  });
}
