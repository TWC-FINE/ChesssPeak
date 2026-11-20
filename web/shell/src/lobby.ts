import { openGamesResponseSchema, type OpenGame } from '@chessspeak/shared';
import { ApiError } from './api.js';
import { gameHash } from './router.js';

type Fetch = typeof fetch;

const COLOR_TEXT = { white: 'blancas', black: 'negras' } as const;

/** GET /games/open, checked against the contract: a reply that does not match it is an error, not an empty list. */
export async function fetchOpenGames(apiUrl: string, fetcher: Fetch = fetch): Promise<OpenGame[]> {
  let response: Response;
  try {
    response = await fetcher(`${apiUrl}/games/open`);
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.');
  }
  if (!response.ok) throw new ApiError('No se pudieron leer las partidas abiertas.');
  const body = openGamesResponseSchema.safeParse(await response.json().catch(() => null));
  if (!body.success) throw new ApiError('El servidor respondió algo inesperado.');
  return body.data.games;
}

/** "hace un momento", "hace 1 min", "hace 12 min". */
export function ageText(createdAt: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(createdAt)) / 60_000);
  return minutes < 1 ? 'hace un momento' : `hace ${minutes} min`;
}

/** One line of the lobby, from the side of whoever would join. */
export function describeOpenGame(game: OpenGame, now: number): string {
  const yours = game.creatorColor === 'white' ? 'black' : 'white';
  const increment = game.incrementMs === undefined ? '' : ` + ${Math.round(game.incrementMs / 1000)} s`;
  const clock = game.clockMs === undefined ? 'sin reloj' : `${Math.round(game.clockMs / 60_000)} min${increment}`;
  return `${game.creator} · juegas con ${COLOR_TEXT[yours]} · ${clock} · ${ageText(game.createdAt, now)}`;
}

export interface LobbyState {
  /** null while the first answer has not arrived. */
  games: OpenGame[] | null;
  error: string;
}

/** The list of the home route. Joining is only opening the game: the server gives the seat on game:join. */
export function renderLobby(host: HTMLElement, state: LobbyState, refresh: () => void, now: number = Date.now()): void {
  const title = document.createElement('h2');
  title.className = 'cs-lobby-title';
  title.textContent = 'Partidas esperando rival';
  const again = document.createElement('button');
  again.type = 'button';
  again.dataset.action = 'refresh-lobby';
  again.textContent = 'Actualizar';
  again.addEventListener('click', refresh);
  const head = document.createElement('div');
  head.className = 'cs-lobby-head';
  head.append(title, again);

  const children: HTMLElement[] = [head];
  if (state.error !== '') {
    const error = document.createElement('p');
    error.className = 'cs-lobby-note';
    error.setAttribute('role', 'alert');
    error.textContent = state.error;
    children.push(error);
  } else if (state.games === null) {
    children.push(note('Buscando partidas…'));
  } else if (state.games.length === 0) {
    children.push(note('No hay partidas esperando. Crea una y comparte el enlace.'));
  } else {
    const list = document.createElement('ul');
    list.className = 'cs-lobby-list';
    for (const game of state.games) {
      const item = document.createElement('li');
      item.dataset.openGame = game.gameId;
      const text = document.createElement('span');
      text.textContent = describeOpenGame(game, now);
      const join = document.createElement('a');
      join.className = 'cs-lobby-join';
      join.href = gameHash(game.gameId);
      join.dataset.action = 'join-game';
      join.textContent = 'Unirse';
      item.append(text, join);
      list.append(item);
    }
    children.push(list);
  }
  host.replaceChildren(...children);
}

function note(text: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.className = 'cs-lobby-note';
  element.textContent = text;
  return element;
}
