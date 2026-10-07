import { task } from "@trigger.dev/sdk/v3";
import { warmupRegionalRedis } from "@/external/redis/initUtils/redisWarmup.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { RunMigrationPayloadSchema } from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";
import {
	MIGRATION_TASK_RETRY,
	migrationRunQueue,
	resolveMigrationChunkPartitions,
} from "@/trigger/migrations/migrationTaskQueue.js";
import { runBatchMigrationChunkTask } from "@/trigger/migrations/runBatchMigrationChunkTask/runBatchMigrationChunkTask.js";
import { runMigrationChunkTask } from "@/trigger/migrations/runMigrationChunkTask/runMigrationChunkTask.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

export const runMigrationTask = task({
	id: "run-migration",
	queue: migrationRunQueue,
	retry: MIGRATION_TASK_RETRY,
	machine: "medium-1x",
	// Trigger.dev has no true "disable" — set very high to effectively remove the timeout.
	maxDuration: 86400,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = RunMigrationPayloadSchema.parse(rawPayload);
		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		// Trigger tasks start with cold Redis clients; warm them before
		// preparation and cache work so availability checks do not short-circuit.
		await warmupRegionalRedis().catch((error) => {
			logger.warn("run-migration: redis warmup failed (continuing)", {
				data: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
		});

		const migration = await migrationRepo.find({
			ctx,
			id: payload.migrationId,
		});
		const partitions = await resolveMigrationChunkPartitions();
		await runMigrationInChunks({
			ctx,
			migration,
			migrationRunId: payload.migrationRunId,
			dryRun: payload.dryRun,
			lazyRun: payload.lazyRun,
			controls: payload.controls,
			partitions,
			runChunk: (chunkPayload) =>
				runMigrationChunkTask
					.triggerAndWait(chunkPayload, {
						idempotencyKey: `migration-chunk:${chunkPayload.migrationRunId}:${chunkPayload.chunkIndex}`,
						idempotencyKeyTTL: "7d",
					})
					.unwrap(),
			// batchTriggerAndWait settles every chunk before returning; never Promise.all waits.
			runChunkRound: async (chunkPayloads) => {
				const round = await runMigrationChunkTask.batchTriggerAndWait(
					chunkPayloads.map((chunkPayload) => ({
						payload: chunkPayload,
						options: {
							idempotencyKey: `migration-chunk:${chunkPayload.migrationRunId}:${chunkPayload.chunkIndex}`,
							idempotencyKeyTTL: "7d",
						},
					})),
				);
				return round.runs.map((run) => {
					if (!run.ok) throw run.error;
					return run.output;
				});
			},
			runBatchChunk: (chunkPayload) =>
				runBatchMigrationChunkTask
					.triggerAndWait(chunkPayload, {
						idempotencyKey: `batch-migration-chunk:${chunkPayload.migrationRunId}:${chunkPayload.chunkIndex}`,
						idempotencyKeyTTL: "7d",
					})
					.unwrap(),
		});
	},
});
