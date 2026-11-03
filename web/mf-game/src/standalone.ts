import type { GameContext } from '@chessspeak/shared';

const element = document.getElementById('mf');
const log = document.getElementById('log');
// listen before the tag is registered: <mf-*> announces itself as soon as it is upgraded
document.addEventListener('cs:mf-ready', (event) => {
  if (log !== null) log.textContent += `${event.type} ${JSON.stringify((event as CustomEvent).detail)}\n`;
});
if (element !== null) {
  const context: GameContext = { v: 1, gameId: 'demo', orientation: 'white' };
  (element as HTMLElement & { context: GameContext }).context = context;
}

await import('./mf-game.js');
