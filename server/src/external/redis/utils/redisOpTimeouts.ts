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
	secretKeyGet: 200,
	secretKeySet: 200,
	featureBalances: 500,
	featureBalancesBatch: 1200,
	subjectPipeline: 1200,
} as const;
