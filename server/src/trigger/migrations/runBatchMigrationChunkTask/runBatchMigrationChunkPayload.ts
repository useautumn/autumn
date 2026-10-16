import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runBatchMigrationChunk } from "@/internal/migrations/v2/batchOperations/execute/runBatchMigrationChunk.js";
import { BATCH_MIGRATION_PAGES_PER_CHUNK } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import { measureApplyBillingPlanSends } from "@/internal/migrations/v2/batchOperations/queuedLane/measureApplyBillingPlanSends.js";
import { runQueuedLaneChunk } from "@/internal/migrations/v2/batchOperations/queuedLane/runQueuedLaneChunk.js";
import type { RunBatchMigrationChunkPayload } from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";

export const runBatchMigrationChunkPayload = async ({
	ctx,
	payload,
	deadlineAt,
}: {
	ctx: AutumnContext;
	payload: RunBatchMigrationChunkPayload;
	deadlineAt?: number;
}) => {
	if (payload.queuedLane)
		return runQueuedLaneChunk({
			ctx,
			migration: payload.migration,
			migrationRunId: payload.migrationRunId,
			plan: payload.plan,
			scenario: payload.queuedLane.scenario,
			afterInternalId: payload.cursor,
			maxPages: BATCH_MIGRATION_PAGES_PER_CHUNK,
			deadlineAt,
		});

	const { result, sendLatencyMs } = await measureApplyBillingPlanSends({
		run: () =>
			runBatchMigrationChunk({
				ctx,
				migration: payload.migration,
				migrationRunId: payload.migrationRunId,
				plan: payload.plan,
				afterInternalId: payload.cursor,
				maxPages: BATCH_MIGRATION_PAGES_PER_CHUNK,
				webhooks: payload.webhooks,
				controls: payload.controls,
				deadlineAt,
			}),
	});
	return { ...result, sendLatencyMs };
};
