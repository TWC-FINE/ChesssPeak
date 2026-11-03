import { describe, expect, it } from 'vitest';
import { identitySchema, type Identity } from '../src/index.js';

describe('identitySchema', () => {
  it('accepts a guest and a registered user', () => {
    const guest: Identity = identitySchema.parse({ kind: 'guest', guestId: 'g-1' });
    expect(guest.kind).toBe('guest');
    expect(identitySchema.parse({ kind: 'user', userId: 'u-1' }).kind).toBe('user');
  });

  it('rejects an unknown kind and an empty id', () => {
    expect(identitySchema.safeParse({ kind: 'bot', guestId: 'x' }).success).toBe(false);
    expect(identitySchema.safeParse({ kind: 'guest', guestId: '' }).success).toBe(false);
  });
});
