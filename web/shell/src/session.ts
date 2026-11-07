import type { GuestAuthResponse } from '@chessspeak/shared';

const KEY = 'cs-session';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The session of this tab. sessionStorage survives a reload, which is what a reconnection needs,
 * and each tab has its own, so two tabs of one browser are two guests.
 */
export function loadSession(store: Store | undefined): GuestAuthResponse | null {
  try {
    const raw = store?.getItem(KEY);
    if (raw === null || raw === undefined) return null;
    const session = JSON.parse(raw) as Partial<GuestAuthResponse>;
    return typeof session.token === 'string' && typeof session.identity?.displayName === 'string' ? (session as GuestAuthResponse) : null;
  } catch {
    return null;
  }
}

export function saveSession(store: Store | undefined, session: GuestAuthResponse): void {
  try {
    store?.setItem(KEY, JSON.stringify(session));
  } catch {
    // private window or blocked storage: the session lasts until this page is reloaded
  }
}

export function clearSession(store: Store | undefined): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
