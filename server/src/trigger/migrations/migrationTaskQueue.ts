import { queue, queues, wait } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { MigrationRunScheduler } from "@/internal/migrations/v2/run/types/migrationRunScheduler.js";

export const MIGRATION_TASK_QUEUE_NAME = "migration-customer-work";
export const MIGRATION_CUSTOMER_CONCURRENCY = 1;
export const MIGRATION_SLICE_DURATION_MS = 10_000;
export const MIGRATION_YIELD_SECONDS = 6;

export const migrationTaskQueue = queue({
	name: MIGRATION_TASK_QUEUE_NAME,
	concurrencyLimit: MIGRATION_CUSTOMER_CONCURRENCY,
});

export const getMigrationTriggerOptions = ({ isDev }: { isDev: boolean }) =>
	isDev ? { region: "eu-central-1" as const } : {};

const getQueuedMigrationTaskCount = async () => {
	const queueState = await queues.retrieve({
		type: "custom",
		name: MIGRATION_TASK_QUEUE_NAME,
	});
	return queueState.queued;
};

const checkpointMigrationTask = async () => {
	await wait.for({ seconds: MIGRATION_YIELD_SECONDS });
};

export const createMigrationTaskScheduler = ({
	logger,
	getQueuedCount = getQueuedMigrationTaskCount,
	checkpoint = checkpointMigrationTask,
	now = Date.now,
}: {
	logger: Pick<Logger, "info" | "warn">;
	getQueuedCount?: () => Promise<number>;
	checkpoint?: () => Promise<void>;
	now?: () => number;
}): MigrationRunScheduler => ({
	sliceDurationMs: MIGRATION_SLICE_DURATION_MS,
	now,
	onSliceComplete: async () => {
		let queuedCount: number;
		try {
			queuedCount = await getQueuedCount();
		} catch (error) {
			logger.warn("run-migration: shared queue inspection failed, yielding", {
				data: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
			await checkpoint();
			return;
		}

		if (queuedCount <= 0) return;

		logger.info("run-migration: yielding shared queue", {
			data: { queuedCount },
		});
		await checkpoint();
	},
});
