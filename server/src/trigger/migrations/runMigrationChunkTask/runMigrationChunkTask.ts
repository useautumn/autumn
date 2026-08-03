import { task } from "@trigger.dev/sdk/v3";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import { executeRunMigrationChunk } from "@/internal/migrations/v2/run/executeRunMigrationChunk.js";
import { RunMigrationChunkPayloadSchema } from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";
import {
	MIGRATION_CHUNK_MAX_DURATION_SECONDS,
	MIGRATION_TASK_RETRY,
	migrationTaskQueue,
} from "@/trigger/migrations/migrationTaskQueue.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

export const runMigrationChunkTask = task({
	id: "run-migration-chunk",
	queue: migrationTaskQueue,
	retry: MIGRATION_TASK_RETRY,
	machine: "medium-1x",
	maxDuration: MIGRATION_CHUNK_MAX_DURATION_SECONDS,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = RunMigrationChunkPayloadSchema.parse(rawPayload);
		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		// Trigger tasks start with cold Redis clients; warm before chunk work.
		await warmupRegionalRedis().catch((error) => {
			logger.warn("run-migration-chunk: redis warmup failed (continuing)", {
				data: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
		});

		return executeRunMigrationChunk({ ctx, payload });
	},
});
