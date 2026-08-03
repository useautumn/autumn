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

/** One live run task per concurrencyKey — ALWAYS trigger with
 * `migrationRunConcurrencyKey`, never bare: concurrencyKey copies this queue
 * per (org, env), so a key-less trigger would share ONE GLOBAL slot across
 * every org. Separate from migrationTaskQueue (chunks) so a waiting parent
 * can never deadlock its own children. */
export const migrationRunQueue = queue({
	name: "migration-run",
	concurrencyLimit: 1,
});

/** Real runs serialize per (org, env); dry runs take a separate key so
 * previews never block — or get blocked by — real runs. */
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
