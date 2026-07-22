import { queue } from "@trigger.dev/sdk/v3";
import type { MigrationRunScheduler } from "@/internal/migrations/v2/run/types/migrationRunScheduler.js";

export const MIGRATION_TASK_QUEUE_NAME = "migration-customer-work";
export const MIGRATION_CUSTOMER_CONCURRENCY = 1;
export const MIGRATION_CHUNK_FETCH_SIZE = 100;
export const MIGRATION_SLICE_DURATION_MS = 10_000;
export const MIGRATION_TASK_RETRY = { maxAttempts: 1 } as const;

export const migrationTaskQueue = queue({
	name: MIGRATION_TASK_QUEUE_NAME,
	concurrencyLimit: MIGRATION_CUSTOMER_CONCURRENCY,
});

export const getMigrationTriggerOptions = ({ isDev }: { isDev: boolean }) =>
	isDev ? { region: "eu-central-1" as const } : {};

export const createMigrationChunkScheduler = ({
	now = Date.now,
}: {
	now?: () => number;
} = {}): MigrationRunScheduler => ({
	batchSize: MIGRATION_CHUNK_FETCH_SIZE,
	sliceDurationMs: MIGRATION_SLICE_DURATION_MS,
	now,
});
