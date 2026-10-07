import { queue, queues } from "@trigger.dev/sdk/v3";

export const MIGRATION_TASK_QUEUE_NAME = "migration-customer-work";
export const MIGRATION_TASK_QUEUE_CONCURRENCY = 1;
/** Ceiling on concurrent chunks one run fans out to, whatever the queue override. */
export const MIGRATION_MAX_CHUNK_PARTITIONS = 8;
export const MIGRATION_CHUNK_MAX_DURATION_SECONDS = 30 * 60;
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

export const migrationRunTag = ({
	migrationRunId,
}: {
	migrationRunId: string;
}) => `mrun:${migrationRunId}`;

/** Concurrent chunks per run = the queue's effective limit (dashboard override
 * included), read once at run start. Any lookup failure keeps today's serial run. */
export const resolveMigrationChunkPartitions = async (): Promise<number> => {
	try {
		const migrationQueue = await queues.retrieve({
			type: "custom",
			name: MIGRATION_TASK_QUEUE_NAME,
		});
		const limit =
			migrationQueue.concurrency?.current ?? migrationQueue.concurrencyLimit;
		if (!limit || limit < 1) return 1;
		return Math.min(Math.floor(limit), MIGRATION_MAX_CHUNK_PARTITIONS);
	} catch {
		return 1;
	}
};
