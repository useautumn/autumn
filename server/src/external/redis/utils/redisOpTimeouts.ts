/**
 * Opt-in per-operation Redis bounds (positive-limiting): anything absent here
 * keeps the client's `commandTimeout` — 1s on V2, 10s on legacy.
 *
 * Only reads with a working non-Redis path belong here. A timed-out write is
 * ambiguous — `withTimeout` abandons the promise but the command still lands.
 * Values are sized above each op's measured production p99.9.
 */
export const REDIS_OP_TIMEOUT_MS = {
	/** p99.9 137ms. Falls through to Postgres via verifyKey. */
	secretKeyGet: 200,
	/** p99.9 208ms — 200 would clip real traffic. */
	orgFeaturesGet: 300,
	/** p99.9 297ms on shared V2; this site also serves the dedicated cluster. */
	featureBalances: 400,
	/** p99.9 643-938ms; latency scales with the customer's feature count. */
	featureBalancesBatch: 600,
	/** p99.9 849ms across the pipe[get,get] pool. */
	subjectPipeline: 600,
} as const;
