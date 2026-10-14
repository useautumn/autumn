/** Longest a shutdown flush waits on any one sink (Axiom transport, Sazabi export, error reports). */
export const LOG_FLUSH_TIMEOUT_MS = 2_000;

/** Small batches keep each synchronous serialise short; the timeout bounds a slow or down intake. */
export const SAZABI_EXPORT = {
	timeoutMs: 5_000,
	intervalMs: 1_000,
	maxBatchSize: 128,
} as const;
