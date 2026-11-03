import { z } from 'zod';

/** Who is playing. The server decides it; a client never sends its own identity as a fact. */
export const identitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('guest'), guestId: z.string().min(1) }),
  z.object({ kind: z.literal('user'), userId: z.string().min(1) }),
]);

export type Identity = z.infer<typeof identitySchema>;
