// Zod-free runtime values for the browser: importing them does not pull the schemas into a bundle.

/** Init of every cs:* event: dispatched from the emitting element, they bubble up to `document`. */
export const CS_EVENT_INIT = { bubbles: true, composed: true } as const;

/** Standard starting position. */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
