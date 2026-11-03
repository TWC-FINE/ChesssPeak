import { describe, expect, it } from 'vitest';
import { identitySchema, type Identity } from '../src/index.js';

describe('identitySchema', () => {
  it('accepts a guest and a registered user, each with a display name', () => {
    const guest: Identity = identitySchema.parse({ kind: 'guest', guestId: 'g-1', displayName: 'Ana' });
    expect(guest.kind).toBe('guest');
    expect(identitySchema.parse({ kind: 'user', userId: 'u-1', displayName: 'Luis' }).kind).toBe('user');
  });

  it('rejects an unknown kind, an empty id and a missing display name', () => {
    expect(identitySchema.safeParse({ kind: 'bot', guestId: 'x', displayName: 'A' }).success).toBe(false);
    expect(identitySchema.safeParse({ kind: 'guest', guestId: '', displayName: 'A' }).success).toBe(false);
    expect(identitySchema.safeParse({ kind: 'guest', guestId: 'g' }).success).toBe(false);
  });
});
