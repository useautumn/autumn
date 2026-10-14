import type { MigrationRunScheduler } from "../types/migrationRunScheduler.js";

export const LAZY_MIGRATION_RUNS_DISABLED = true;

/** The migration pool in @autumn/postgres sizes itself from the same variable: two connections per customer. */
export const MIGRATION_RUN_CUSTOMER_CONCURRENCY =
	Number(process.env.MIGRATION_RUN_CUSTOMER_CONCURRENCY) || 50;
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
