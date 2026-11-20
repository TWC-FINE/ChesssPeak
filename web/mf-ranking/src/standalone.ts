import type { ProfileResponse, RankingContext, RankingResponse } from '@chessspeak/shared';

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
// every player gets the same made-up profile, with their own row
const profile = (displayName: string): ProfileResponse | undefined => {
  const entry = ranking.entries.find((candidate) => candidate.displayName.toLowerCase() === displayName.toLowerCase());
  if (entry === undefined) return undefined;
  return {
    entry,
    games: [
      { gameId: 'g2', color: 'black', opponent: 'Rival', outcome: 'win', termination: 'checkmate', finishedAt: '2026-11-20T18:00:00.000Z', rating: entry.rating, ratingChange: 18 },
      { gameId: 'g1', color: 'white', opponent: 'Rival', outcome: 'draw', termination: 'agreement', finishedAt: '2026-11-19T18:00:00.000Z', rating: entry.rating - 18, ratingChange: 2 },
    ],
    ratingHistory: [1200, entry.rating - 18, entry.rating],
  };
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (input, init) => {
  const url = String(input);
  if (url === `${API_URL}/ranking`) return reply(ranking);
  if (url.startsWith(`${API_URL}/ranking/`)) {
    const found = profile(decodeURIComponent(url.slice(`${API_URL}/ranking/`.length)));
    return found === undefined ? reply({ message: 'No rated games for that player' }, 404) : reply(found);
  }
  return realFetch(input, init);
};

if (element !== null) {
  const context: RankingContext = { v: 1, apiUrl: API_URL, active: true };
  (element as HTMLElement & { context: RankingContext }).context = context;
}

await import('./mf-ranking.js');
