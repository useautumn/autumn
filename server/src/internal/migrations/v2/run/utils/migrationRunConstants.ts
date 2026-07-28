import type { MigrationRunScheduler } from "../types/migrationRunScheduler.js";

export const MIGRATION_RUN_CUSTOMER_CONCURRENCY = 1;
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
