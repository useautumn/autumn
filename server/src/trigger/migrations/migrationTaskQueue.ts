import { queue } from "@trigger.dev/sdk/v3";

export const MIGRATION_TASK_QUEUE_NAME = "migration-customer-work";
export const MIGRATION_TASK_QUEUE_CONCURRENCY = 1;
export const MIGRATION_CHUNK_MAX_DURATION_SECONDS = 30 * 60;
export const MIGRATION_LAZY_TASK_PRIORITY_SECONDS = 5 * 60;
export const MIGRATION_TASK_RETRY = { maxAttempts: 1 } as const;

export const migrationTaskQueue = queue({
	name: MIGRATION_TASK_QUEUE_NAME,
	concurrencyLimit: MIGRATION_TASK_QUEUE_CONCURRENCY,
});

export const migrationRunQueue = queue({
	name: "migration-run",
	concurrencyLimit: 1,
});

export const migrationRunConcurrencyKey = ({
	orgId,
	env,
	dryRun,
}: {
	orgId: string;
	env: string;
	dryRun: boolean;
}) => `${orgId}:${env}${dryRun ? ":dry" : ""}`;

export const getMigrationTriggerOptions = ({ isDev }: { isDev: boolean }) =>
	isDev ? { region: "eu-central-1" as const } : {};

export const migrationRunTag = ({
	migrationRunId,
}: {
	migrationRunId: string;
}) => `mrun:${migrationRunId}`;
