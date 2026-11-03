import { z } from 'zod';

/**
 * DRAFT of the browser events between the shell and the microfrontends (prefix `cs:`).
 * Provisional and minimal: only what the test pages use. The formal v0 contract is part 0c.
 */
export const CS_EVENT_VERSION = 1;

export const csEventSchemas = {
  /** A microfrontend registered its tag and is ready to receive `el.context`. */
  'cs:mf-ready': z.object({ v: z.literal(1), name: z.string().min(1) }),
  /** The shell changed route. */
  'cs:route-changed': z.object({ v: z.literal(1), route: z.string().min(1), gameId: z.string().min(1).optional() }),
} as const;

export type CsEventName = keyof typeof csEventSchemas;
export type CsEventDetail<K extends CsEventName> = z.infer<(typeof csEventSchemas)[K]>;
