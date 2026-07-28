import { queue } from "@trigger.dev/sdk/v3";

export const MIGRATION_TASK_QUEUE_NAME = "migration-customer-work";
export const MIGRATION_TASK_QUEUE_CONCURRENCY = 1;
export const MIGRATION_CHUNK_MAX_DURATION_SECONDS = 15 * 60;
export const MIGRATION_LAZY_TASK_PRIORITY_SECONDS = 5 * 60;
// Interrupted item claims cannot yet be recovered safely without operator intent.
export const MIGRATION_TASK_RETRY = { maxAttempts: 1 } as const;

export const migrationTaskQueue = queue({
	name: MIGRATION_TASK_QUEUE_NAME,
	concurrencyLimit: MIGRATION_TASK_QUEUE_CONCURRENCY,
});

export const getMigrationTriggerOptions = ({ isDev }: { isDev: boolean }) =>
	isDev ? { region: "eu-central-1" as const } : {};
