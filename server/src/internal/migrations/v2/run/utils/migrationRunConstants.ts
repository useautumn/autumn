import type { MigrationRunScheduler } from "../types/migrationRunScheduler.js";

/** Hard kill-switch for the lazy migration path (API, request-path enqueue,
 * and the per-customer lazy task). Flip to re-enable. */
export const LAZY_MIGRATION_RUNS_DISABLED = true;

export const MIGRATION_RUN_CUSTOMER_CONCURRENCY = 25;
export const MIGRATION_CHUNK_FETCH_SIZE = 100;
export const MIGRATION_SLICE_DURATION_MS = 10_000;

export const createMigrationChunkScheduler = ({
	now = Date.now,
}: {
	now?: () => number;
} = {}): MigrationRunScheduler => ({
	batchSize: MIGRATION_CHUNK_FETCH_SIZE,
	sliceDurationMs: MIGRATION_SLICE_DURATION_MS,
	now,
});
