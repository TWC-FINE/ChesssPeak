import type { HistoryContext } from '@chessspeak/shared';

const element = document.getElementById('mf');
const log = document.getElementById('log');
// listen before the tag is registered: <mf-*> announces itself as soon as it is upgraded
document.addEventListener('cs:mf-ready', (event) => {
  if (log !== null) log.textContent += `${event.type} ${JSON.stringify((event as CustomEvent).detail)}\n`;
});
if (element !== null) {
  const context: HistoryContext = { v: 1, gameId: 'demo', moves: ['e2e4', 'e7e5'] };
  (element as HTMLElement & { context: HistoryContext }).context = context;
}

await import('./mf-history.js');
