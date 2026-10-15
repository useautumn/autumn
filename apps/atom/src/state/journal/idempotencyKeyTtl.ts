/** The key window: a track's claim on its idempotency key lasts this long, and the journal holds the key row as long. */
export const IDEMPOTENCY_KEY_TTL_MS = 30 * 60_000;
