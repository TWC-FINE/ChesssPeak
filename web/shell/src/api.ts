import type { CreateGameRequest, CreateGameResponse, GuestAuthResponse } from '@chessspeak/shared';

type Fetch = typeof fetch;

/** A failed request, with a text the page can show. */
export class ApiError extends Error {}

async function post<T>(fetcher: Fetch, url: string, body: unknown, messages: Record<number, string>, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.');
  }
  if (!response.ok) throw new ApiError(messages[response.status] ?? `El servidor respondió con un error (${response.status}).`);
  return (await response.json()) as T;
}

export function signIn(apiUrl: string, displayName: string, fetcher: Fetch = fetch): Promise<GuestAuthResponse> {
  return post(fetcher, `${apiUrl}/auth/guest`, { displayName }, {
    400: 'El nombre debe tener entre 1 y 24 caracteres.',
    429: 'Demasiados intentos. Espera un minuto.',
    503: 'El servidor no puede crear invitados ahora mismo.',
  });
}

export async function createGame(apiUrl: string, token: string, color: CreateGameRequest['color'], fetcher: Fetch = fetch): Promise<string> {
  const { gameId } = await post<CreateGameResponse>(fetcher, `${apiUrl}/games`, { color }, {
    401: 'Tu sesión caducó. Vuelve a entrar.',
    503: 'No se pudo crear la partida. Inténtalo de nuevo.',
  }, token);
  return gameId;
}
