import { CS_EVENT_INIT, START_FEN, type CsEventDetail, type HistoryContext } from '@chessspeak/shared';

const element = document.getElementById('mf');
const log = document.getElementById('log');
// listen before the tag is registered: <mf-*> announces itself as soon as it is upgraded
document.addEventListener('cs:mf-ready', (event) => {
  if (log !== null) log.textContent += `${event.type} ${JSON.stringify((event as CustomEvent).detail)}\n`;
});
if (element !== null) {
  const context: HistoryContext = { v: 1, gameId: 'demo' };
  (element as HTMLElement & { context: HistoryContext }).context = context;
}

await import('./mf-history.js');

// simulated moves, as <mf-game> would announce them
const moves: CsEventDetail<'cs:move-applied'>[] = [
  { v: 1, gameId: 'demo', ply: 1, uci: 'e2e4', san: 'e4', fen: START_FEN },
  { v: 1, gameId: 'demo', ply: 2, uci: 'e7e5', san: 'e5', fen: START_FEN },
];
for (const detail of moves) document.dispatchEvent(new CustomEvent('cs:move-applied', { ...CS_EVENT_INIT, detail }));
