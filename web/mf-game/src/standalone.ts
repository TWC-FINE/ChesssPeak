import './mf-game.js';
import type { GameContext } from '@chessspeak/shared';

const element = document.getElementById('mf');
const log = document.getElementById('log');
if (element !== null) {
  const context: GameContext = { v: 1, gameId: 'demo', orientation: 'white' };
  (element as HTMLElement & { context: GameContext }).context = context;
  element.addEventListener('cs:mf-ready', (event) => {
    if (log !== null) log.textContent += `${event.type} ${JSON.stringify((event as CustomEvent).detail)}\n`;
  });
}
