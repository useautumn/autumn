import { task } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type RunMigrationResult,
	runPreparedMigration,
} from "@/internal/migrations/v2/run/runMigration.js";
import { isMigrationCancelRequested } from "@/internal/migrations/v2/run/utils/migrationCancelToken.js";
import {
	type RunMigrationChunkPayload,
	RunMigrationChunkPayloadSchema,
} from "@/trigger/migrations/migrationTaskPayload.js";
import {
	createMigrationChunkScheduler,
	MIGRATION_CHUNK_MAX_DURATION_SECONDS,
	MIGRATION_RUN_CUSTOMER_CONCURRENCY,
	MIGRATION_TASK_RETRY,
	migrationTaskQueue,
} from "@/trigger/migrations/migrationTaskQueue.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

export const executeRunMigrationChunk = async ({
	ctx,
	logger,
	payload,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payload: RunMigrationChunkPayload;
}): Promise<RunMigrationResult> => {
	await warmupRegionalRedis().catch((error) => {
		logger.warn("run-migration-chunk: redis warmup failed (continuing)", {
			data: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
	});

	if (
		await isMigrationCancelRequested({ migrationRunId: payload.migrationRunId })
	) {
		return {
			processed: 0,
			completion: "stopped",
			cursor: payload.cursor ?? null,
		};
	}

	if (
		payload.migration.id !== payload.migrationId ||
		payload.migration.org_id !== payload.orgId ||
		payload.migration.env !== payload.env
	) {
		throw new Error("Migration chunk snapshot identity does not match payload");
	}

	logger.info("run-migration-chunk: starting", {
		data: {
			migrationRunId: payload.migrationRunId,
			chunkIndex: payload.chunkIndex,
			limit: payload.controls?.limit,
		},
	});

	const result = await runPreparedMigration({
		ctx,
		migration: payload.migration,
		migrationRunId: payload.migrationRunId,
		dryRun: payload.dryRun,
		controls: {
			...(payload.controls ?? {}),
			concurrency: MIGRATION_RUN_CUSTOMER_CONCURRENCY,
			checkpointDryRun: true,
		},
		scheduler: createMigrationChunkScheduler(),
		includeFilterCount: false,
		afterInternalId: payload.cursor,
	});

	logger.info("run-migration-chunk: done", {
		data: {
			migrationRunId: payload.migrationRunId,
			chunkIndex: payload.chunkIndex,
			processed: result.processed,
			completion: result.completion,
		},
	});

	return result;
};

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

		return executeRunMigrationChunk({ ctx, logger, payload });
	},
});
