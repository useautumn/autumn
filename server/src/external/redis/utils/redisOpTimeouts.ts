/**
 * Opt-in per-operation Redis bounds (positive-limiting): anything absent here
 * keeps the client's `commandTimeout` — 1s on V2, 10s on legacy.
 *
 * Only ops with a working non-Redis path belong here. Reads qualify by default;
 * a write qualifies only when landing late or not at all is harmless — a TTL'd
 * read-through cache write costs one extra miss, so `withTimeout` abandoning
 * the promise is safe. Writes carrying state no other path can rebuild are not.
 * Values are sized above each op's measured production p99.9.
 *
 * A value above the client's `commandTimeout` is inert: ioredis arms that timer
 * per command at dispatch (offline-queued commands and pipeline members
 * included), so on V2 the 1s ceiling ends the attempt first and the p99.9
 * figures below are measured against an already-truncated tail.
 */
export const REDIS_OP_TIMEOUT_MS = {
	/** p99.9 137ms. Falls through to Postgres via verifyKey. */
	secretKeyGet: 200,
	/** p99.9 208ms — 200 would clip real traffic. */
	orgFeaturesGet: 300,
	// The write-back halves. Unbounded they inherit the misc client's 10s prod
	// `commandTimeout`, and both are awaited inline after the Postgres fallback.
	secretKeySet: 200,
	orgFeaturesSet: 300,
	/** p99.9 297ms on shared V2; this site also serves the dedicated cluster.
	 *  The only standby-retry caller the wrapper actually bounds, so 500 rather
	 *  than 400: the reserve has to come out of headroom, not out of the tail. */
	featureBalances: 500,
	/** p99.9 643-938ms; latency scales with the customer's feature count.
	 *  V2's 1s `commandTimeout` binds before this does. */
	featureBalancesBatch: 1200,
	/** p99.9 849ms across the pipe[get,get] pool.
	 *  V2's 1s `commandTimeout` binds before this does. */
	subjectPipeline: 1200,
} as const;
