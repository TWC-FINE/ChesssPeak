import './mf-history.js';
import type { HistoryContext } from '@chessspeak/shared';

const element = document.getElementById('mf');
const log = document.getElementById('log');
if (element !== null) {
  const context: HistoryContext = { v: 1, gameId: 'demo', moves: ['e2e4', 'e7e5'] };
  (element as HTMLElement & { context: HistoryContext }).context = context;
  element.addEventListener('cs:mf-ready', (event) => {
    if (log !== null) log.textContent += `${event.type} ${JSON.stringify((event as CustomEvent).detail)}\n`;
  });
}
