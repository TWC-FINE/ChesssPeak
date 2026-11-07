/**
 * Wait between releasing the talk button and calling `stop()` on Web Speech. It is a product
 * requirement, measured in the spike (run B): see docs/adr/0005-strategy-y-reconocedor-por-defecto.md.
 * The voice input context may override it; this is the default.
 */
export const DEFAULT_RELEASE_DELAY_MS = 400;

/** Release delay of a voice input context, or the default. */
export function releaseDelayOf(context: { releaseDelayMs?: number | undefined } | undefined): number {
  return context?.releaseDelayMs ?? DEFAULT_RELEASE_DELAY_MS;
}
