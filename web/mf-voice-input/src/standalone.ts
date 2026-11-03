import type { VoiceInputContext } from '@chessspeak/shared';

const element = document.getElementById('mf');
const log = document.getElementById('log');
// listen before the tag is registered: <mf-*> announces itself as soon as it is upgraded
document.addEventListener('cs:mf-ready', (event) => {
  if (log !== null) log.textContent += `${event.type} ${JSON.stringify((event as CustomEvent).detail)}\n`;
});
if (element !== null) {
  const context: VoiceInputContext = { v: 1, lang: 'es-CO', recognizer: 'webspeech', releaseDelayMs: 400 };
  (element as HTMLElement & { context: VoiceInputContext }).context = context;
}

await import('./mf-voice-input.js');
