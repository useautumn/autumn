import { queue, queues } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { RunMigrationChunkPayload } from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";

export const MIGRATION_TASK_QUEUE_NAME = "migration-customer-work";
export const MIGRATION_TASK_QUEUE_CONCURRENCY = 1;
/** Ceiling on lanes one run fans out to, whatever the queue override. */
export const MIGRATION_MAX_LANES = 8;
export const MIGRATION_CHUNK_MAX_DURATION_SECONDS = 30 * 60;
export const MIGRATION_LAZY_TASK_PRIORITY_SECONDS = 5 * 60;
// Interrupted item claims cannot yet be recovered safely without operator intent.
export const MIGRATION_TASK_RETRY = { maxAttempts: 1 } as const;

export const migrationTaskQueue = queue({
	name: MIGRATION_TASK_QUEUE_NAME,
	concurrencyLimit: MIGRATION_TASK_QUEUE_CONCURRENCY,
});

/** Lanes only wait on their chunks, so they live off the chunk queue: a lane
 * must never take a `migration-customer-work` slot from the chunk it awaits. */
export const migrationLaneQueue = queue({
	name: "migration-lane",
	concurrencyLimit: MIGRATION_MAX_LANES * 4,
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

/** Serial chunks keep today's key; a lane's chunks are scoped by lane. */
export const migrationChunkIdempotencyKey = ({
	migrationRunId,
	laneIndex,
	chunkIndex,
}: Pick<
	RunMigrationChunkPayload,
	"migrationRunId" | "laneIndex" | "chunkIndex"
>) =>
	laneIndex === undefined
		? `migration-chunk:${migrationRunId}:${chunkIndex}`
		: `migration-chunk:${migrationRunId}:lane${laneIndex}:${chunkIndex}`;

export const laneCountFromQueueLimit = (
	limit: number | null | undefined,
): number =>
	limit && limit >= 1 ? Math.min(Math.floor(limit), MIGRATION_MAX_LANES) : 1;

/** Lanes per run = the chunk queue's effective limit (dashboard override
 * included), read once at run start. A failed lookup keeps today's serial run. */
export const resolveMigrationLaneCount = async ({
	logger,
}: {
	logger: Logger;
}): Promise<number> => {
	try {
		const migrationQueue = await queues.retrieve({
			type: "custom",
			name: MIGRATION_TASK_QUEUE_NAME,
		});
		return laneCountFromQueueLimit(
			migrationQueue.concurrency?.current ?? migrationQueue.concurrencyLimit,
		);
	} catch (error) {
		logger.warn("run-migration: could not read the chunk queue limit", {
			data: { error: error instanceof Error ? error.message : String(error) },
		});
		return 1;
	}
};
