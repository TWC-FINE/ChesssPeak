import type { RankingContext, RankingResponse } from '@chessspeak/shared';

const element = document.getElementById('mf');
const log = document.getElementById('log');
// listen before the tag is registered: <mf-*> announces itself as soon as it is upgraded
document.addEventListener('cs:mf-ready', (event) => {
  if (log !== null) log.textContent += `${event.type} ${JSON.stringify((event as CustomEvent).detail)}\n`;
});

// a simulated server: this page never calls a real one
const ranking: RankingResponse = {
  gamesRated: 5,
  entries: [
    { rank: 1, displayName: 'Marta', rating: 1220, games: 2, wins: 1, draws: 1, losses: 0 },
    { rank: 2, displayName: 'Ana', rating: 1219, games: 3, wins: 2, draws: 0, losses: 1 },
    { rank: 3, displayName: 'Luis', rating: 1201, games: 3, wins: 1, draws: 1, losses: 1 },
    { rank: 4, displayName: 'Pedro', rating: 1160, games: 2, wins: 0, draws: 0, losses: 2 },
  ],
};
const API_URL = 'http://ranking.simulado';
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (String(input) === `${API_URL}/ranking`) return new Response(JSON.stringify(ranking), { headers: { 'Content-Type': 'application/json' } });
  return realFetch(input, init);
};

if (element !== null) {
  const context: RankingContext = { v: 1, apiUrl: API_URL, active: true };
  (element as HTMLElement & { context: RankingContext }).context = context;
}

await import('./mf-ranking.js');
