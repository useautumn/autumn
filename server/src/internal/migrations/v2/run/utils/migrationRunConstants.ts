import type { MigrationRunScheduler } from "../types/migrationRunScheduler.js";

/** Hard kill-switch for the lazy migration path (API, request-path enqueue,
 * and the per-customer lazy task). Flip to re-enable. */
export const LAZY_MIGRATION_RUNS_DISABLED = true;

const positiveIntFromEnv = ({
	envVar,
	fallback,
}: {
	envVar: string;
	fallback: number;
}): number => {
	const parsed = Number(process.env[envVar]);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/** Customers in flight per chunk; tune via env and restart the run, no deploy. */
export const MIGRATION_RUN_CUSTOMER_CONCURRENCY = positiveIntFromEnv({
	envVar: "MIGRATION_RUN_CUSTOMER_CONCURRENCY",
	fallback: 50,
});
/** Chunk-task DB pool: an in-flight customer can hold two connections at once
 * (its transaction plus a standalone read/write), so it defaults to 2× concurrency. */
export const MIGRATION_DB_POOL_MAX = positiveIntFromEnv({
	envVar: "MIGRATION_DB_POOL_MAX",
	fallback: MIGRATION_RUN_CUSTOMER_CONCURRENCY * 2,
});
/** Client-side per-statement deadline. Never a pool statement_timeout: PgBouncer rejects that startup parameter (08P01). */
export const MIGRATION_DB_QUERY_DEADLINE_MS = 75_000;
export const MIGRATION_CHUNK_FETCH_SIZE = 100;
export const MIGRATION_SLICE_DURATION_MS = 10_000;
export const MIGRATION_FILTER_PAGE_TRANSIENT_DB_ATTEMPTS = 5;
export const MIGRATION_FILTER_PAGE_TRANSIENT_DB_RETRY_DELAY_MS = 1_000;
export const MIGRATION_ITEM_SETTLE_DB_ATTEMPTS = 5;
export const MIGRATION_ITEM_SETTLE_DB_RETRY_DELAY_MS = 1_000;

export const createMigrationChunkScheduler = ({
	now = Date.now,
}: {
	now?: () => number;
} = {}): MigrationRunScheduler => ({
	batchSize: MIGRATION_CHUNK_FETCH_SIZE,
	sliceDurationMs: MIGRATION_SLICE_DURATION_MS,
	now,
});
