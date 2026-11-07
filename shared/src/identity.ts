import { z } from 'zod';

const displayNameSchema = z.string().trim().min(1).max(24);

/** Who is playing. The server decides it from the token; a client never sends its own identity as a fact. */
export const identitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('guest'), guestId: z.string().min(1), displayName: displayNameSchema }),
  z.object({ kind: z.literal('user'), userId: z.string().min(1), displayName: displayNameSchema }),
]);

export type Identity = z.infer<typeof identitySchema>;
