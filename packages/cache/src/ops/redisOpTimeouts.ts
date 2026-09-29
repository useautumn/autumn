/** Opt-in per-operation Redis bounds: anything absent keeps the client's `commandTimeout`.
 *  Only ops with a working non-Redis path belong here; each is sized above its prod p99.9. */
export const REDIS_OP_TIMEOUT_MS = {
	/** p99.9 208ms — 200 would clip real traffic. */
	orgFeaturesGet: 300,
	/** The write-back half: awaited inline after the Postgres fallback, so it must not inherit 10s. */
	orgFeaturesSet: 300,
	/** Read and write-back of subscription rows; a stall costs one extra miss. */
	subscriptions: 300,
	/** Read and write-back of a customer's invoice list; a stall costs one extra miss. */
	customerInvoices: 300,
} as const;
