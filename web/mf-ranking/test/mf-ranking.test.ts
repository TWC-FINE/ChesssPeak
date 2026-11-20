import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileResponse, RankingContext, RankingResponse } from '@chessspeak/shared';

type RankingElement = HTMLElement & { context?: RankingContext; updateComplete: Promise<boolean>; load(): Promise<void> };

const API_URL = 'http://127.0.0.1:3000';
const ranking: RankingResponse = {
  gamesRated: 3,
  entries: [
    { rank: 1, displayName: 'Ana', rating: 1240, games: 2, wins: 2, draws: 0, losses: 0 },
    { rank: 2, displayName: 'Luis', rating: 1200, games: 2, wins: 0, draws: 1, losses: 1 },
    { rank: 2, displayName: 'Marta', rating: 1200, games: 1, wins: 0, draws: 1, losses: 0 },
  ],
};

const elements: RankingElement[] = [];
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeAll(async () => {
  await import('../src/mf-ranking.js');
});

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => json(ranking));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  for (const element of elements.splice(0)) element.remove();
  vi.unstubAllGlobals();
});

/** Lets the pending fetch and the render after it finish. */
async function settle(element: RankingElement): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
  }
}

async function mount(context: Partial<RankingContext> = {}): Promise<RankingElement> {
  const element = document.createElement('mf-ranking') as RankingElement;
  element.context = { v: 1, apiUrl: API_URL, active: true, ...context };
  document.body.append(element);
  elements.push(element);
  await settle(element);
  return element;
}

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
const rows = (element: RankingElement) => [...element.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].map(text));

describe('<mf-ranking>', () => {
  it('registers its tag, renders in light DOM and announces itself', async () => {
    const ready = vi.fn();
    document.addEventListener('cs:mf-ready', ready, { once: true });
    const element = await mount();
    expect(customElements.get('mf-ranking')).toBeDefined();
    expect(element.shadowRoot).toBeNull();
    expect((ready.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ v: 1, name: 'mf-ranking' });
  });

  it('reads GET /ranking from the server in the context and shows one row per player', async () => {
    const element = await mount();
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/ranking`);
    expect(rows(element)).toEqual([
      ['1', 'Ana', '1240', '2', '2', '0', '0', '100 %'],
      ['2', 'Luis', '1200', '2', '0', '1', '1', '0 %'],
      ['2', 'Marta', '1200', '1', '0', '1', '0', '0 %'],
    ]);
    expect(text(element)).toContain('Calculado con 3 partidas terminadas');
  });

  it('does not double the slash when the server URL ends with one', async () => {
    await mount({ apiUrl: `${API_URL}/` });
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/ranking`);
  });

  it('says so when there are no finished games yet', async () => {
    fetchMock.mockImplementation(async () => json({ entries: [], gamesRated: 0 }));
    const element = await mount();
    expect(element.querySelector('table')).toBeNull();
    expect(text(element)).toContain('Aún no hay partidas terminadas');
  });

  it('does not ask the server while it is not active', async () => {
    const element = await mount({ active: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(text(element)).toContain('Cargando el ranking');
  });

  it('reloads each time it becomes active, not on every new context', async () => {
    const element = await mount();
    element.context = { v: 1, apiUrl: API_URL, active: true };
    await settle(element);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    element.context = { v: 1, apiUrl: API_URL, active: false };
    await settle(element);
    element.context = { v: 1, apiUrl: API_URL, active: true };
    await settle(element);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reloads with the "Actualizar" button', async () => {
    const element = await mount();
    element.querySelector<HTMLButtonElement>('.csr-refresh')?.click();
    await settle(element);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('explains when the web has no server configured, without calling anything', async () => {
    const element = await mount({ apiUrl: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(text(element.querySelector('[role="alert"]')!)).toBe('La web no tiene servidor configurado.');
  });

  it('shows a readable error when the server cannot be reached', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    const element = await mount();
    expect(text(element)).toContain('No se pudo conectar con el servidor.');
  });

  it('shows the status when the server answers with an error', async () => {
    fetchMock.mockImplementation(async () => json({ message: 'Could not read the ranking' }, 503));
    const element = await mount();
    expect(text(element)).toContain('El servidor respondió con un error (503).');
  });

  it('rejects an answer that does not follow the contract', async () => {
    fetchMock.mockImplementation(async () => json({ entries: [{ displayName: 'Ana' }], gamesRated: 1 }));
    const element = await mount();
    expect(element.querySelector('table')).toBeNull();
    expect(text(element)).toContain('no se entiende');
  });

  it('keeps only the answer to the last request', async () => {
    let answerFirst: (response: Response) => void = () => undefined;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (answerFirst = resolve)))
      .mockImplementationOnce(async () => json({ entries: [], gamesRated: 0 }));
    const element = await mount();
    await element.load();
    answerFirst(json(ranking));
    await settle(element);
    expect(element.querySelector('table')).toBeNull();
    expect(text(element)).toContain('Aún no hay partidas terminadas');
  });

  it('escapes the display names', async () => {
    fetchMock.mockImplementation(async () =>
      json({ entries: [{ rank: 1, displayName: '<img src=x>', rating: 1220, games: 1, wins: 1, draws: 0, losses: 0 }], gamesRated: 1 }),
    );
    const element = await mount();
    expect(element.querySelector('.csr-player img')).toBeNull();
    expect(text(element.querySelector('.csr-player')!)).toBe('<img src=x>');
  });
});

describe('<mf-ranking> player profile', () => {
  const profile: ProfileResponse = {
    entry: ranking.entries[0]!,
    games: [
      { gameId: 'g2', color: 'black', opponent: 'Luis', outcome: 'win', termination: 'agreement', finishedAt: '2026-11-20T18:00:00.000Z', rating: 1240, ratingChange: 20 },
      { gameId: 'g1', color: 'white', opponent: 'Marta', outcome: 'loss', termination: null, finishedAt: null, rating: 1180, ratingChange: -20 },
    ],
    ratingHistory: [1200, 1180, 1240],
  };
  const answer = (body: unknown, status = 200) => fetchMock.mockImplementation(async (input) => (String(input).endsWith('/ranking') ? json(ranking) : json(body, status)));
  const open = async (element: RankingElement, name = 'Ana') => {
    element.querySelector<HTMLButtonElement>(`[data-player="${name}"]`)!.click();
    await settle(element);
  };

  it('opens the profile of a player from their name, with an encoded path', async () => {
    answer(profile);
    const element = await mount({ apiUrl: `${API_URL}/` });
    await open(element);
    expect(fetchMock).toHaveBeenLastCalledWith(`${API_URL}/ranking/Ana`);
    expect(text(element.querySelector('.csr-profile-name')!)).toBe('Ana');
    expect([...element.querySelectorAll('.csr-stats dd')].map(text)).toEqual(['1', '1240', '1240', '2 G · 0 E · 0 P']);
    expect(element.querySelector('.csr-spark')?.getAttribute('aria-label')).toBe('Elo de 1200 a 1240');
    expect(rows(element)).toEqual([
      [expect.stringContaining('2026'), 'Negras', 'Luis', 'Ganó', 'mutuo acuerdo', '1240 +20'],
      ['—', 'Blancas', 'Marta', 'Perdió', '—', '1180 −20'],
    ]);
  });

  it('encodes a name with spaces and accents', async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/ranking') ? json({ ...ranking, entries: [{ ...ranking.entries[0]!, displayName: 'José Luis' }] }) : json(profile),
    );
    const element = await mount();
    await open(element, 'José Luis');
    expect(fetchMock).toHaveBeenLastCalledWith(`${API_URL}/ranking/Jos%C3%A9%20Luis`);
  });

  it('goes back to the ranking, and closes the profile when the route opens again', async () => {
    answer(profile);
    const element = await mount();
    await open(element);
    element.querySelector<HTMLButtonElement>('[data-action=back]')!.click();
    await element.updateComplete;
    expect(element.querySelector('.csr-profile')).toBeNull();
    expect(rows(element)).toHaveLength(3);

    await open(element);
    element.context = { v: 1, apiUrl: API_URL, active: false };
    await settle(element);
    element.context = { v: 1, apiUrl: API_URL, active: true };
    await settle(element);
    expect(element.querySelector('.csr-profile')).toBeNull();
  });

  it('says when the player has no finished game, or the server fails or answers nonsense', async () => {
    const element = await mount();
    answer({ message: 'No rated games for that player' }, 404);
    await open(element);
    expect(text(element.querySelector('[role=alert]')!)).toBe('Este jugador aún no tiene partidas terminadas.');

    element.querySelector<HTMLButtonElement>('[data-action=back]')!.click();
    await element.updateComplete;
    answer({ message: 'down' }, 503);
    await open(element);
    expect(text(element.querySelector('[role=alert]')!)).toContain('(503)');

    element.querySelector<HTMLButtonElement>('[data-action=back]')!.click();
    await element.updateComplete;
    answer({ entry: 'Ana' });
    await open(element);
    expect(text(element.querySelector('[role=alert]')!)).toContain('no se entiende');
  });

  it('ignores a profile that arrives after going back', async () => {
    let release: (response: Response) => void = () => undefined;
    const element = await mount();
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));
    element.querySelector<HTMLButtonElement>('[data-player="Ana"]')!.click();
    await element.updateComplete;
    expect(text(element)).toContain('Cargando el perfil de Ana');
    element.querySelector<HTMLButtonElement>('[data-action=back]')!.click();
    release(json(profile));
    await settle(element);
    expect(element.querySelector('.csr-profile')).toBeNull();
  });
});
