import type { VoiceInputContext } from '@chessspeak/shared';

const element = document.getElementById('mf');
const log = document.getElementById('log');
// listen before the tag is registered: <mf-*> announces itself as soon as it is upgraded
document.addEventListener('cs:mf-ready', (event) => {
  if (log !== null) log.textContent += `${event.type} ${JSON.stringify((event as CustomEvent).detail)}\n`;
});
if (element !== null) {
  const context: VoiceInputContext = { v: 1, gameId: 'demo', lang: 'es-CO', recognizer: 'webspeech', agentUrl: 'http://127.0.0.1:8765' };
  (element as HTMLElement & { context: VoiceInputContext }).context = context;
}

await import('./mf-voice-input.js');
