import { task } from "@trigger.dev/sdk/v3";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import { BATCH_MIGRATION_PAGES_PER_CHUNK } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { RunBatchMigrationChunkPayloadSchema } from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";
import {
	MIGRATION_CHUNK_MAX_DURATION_SECONDS,
	MIGRATION_TASK_RETRY,
	migrationTaskQueue,
} from "@/trigger/migrations/migrationTaskQueue.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

/** One budgeted batch slice (up to PAGES_PER_CHUNK pages). Shares
 * migrationTaskQueue with per-customer chunks so concurrent migrations
 * interleave instead of one run holding the fleet. */
export const runBatchMigrationChunkTask = task({
	id: "run-batch-migration-chunk",
	queue: migrationTaskQueue,
	retry: MIGRATION_TASK_RETRY,
	machine: "medium-1x",
	maxDuration: MIGRATION_CHUNK_MAX_DURATION_SECONDS,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = RunBatchMigrationChunkPayloadSchema.parse(rawPayload);
		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		await warmupRegionalRedis().catch((error) => {
			logger.warn(
				"run-batch-migration-chunk: redis warmup failed (continuing)",
				{
					data: {
						error: error instanceof Error ? error.message : String(error),
					},
				},
			);
		});

		return runBatchMigrationChunk({
			ctx,
			migration: payload.migration,
			migrationRunId: payload.migrationRunId,
			plan: payload.plan,
			afterInternalId: payload.cursor,
			maxPages: BATCH_MIGRATION_PAGES_PER_CHUNK,
			webhooks: payload.webhooks,
			controls: payload.controls,
		});
	},
});
