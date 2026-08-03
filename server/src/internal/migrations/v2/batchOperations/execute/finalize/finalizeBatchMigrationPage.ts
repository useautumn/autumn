import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationWebhookControls } from "@/internal/migrations/v2/cloudAdapter/types.js";
import { queueMigrationWebhooks } from "@/internal/migrations/v2/webhookDelivery/utils/queueMigrationWebhooks.js";
import { buildBatchMigrationWebhookRecords } from "../../finalize/buildBatchMigrationWebhookRecords/buildBatchMigrationWebhookRecords.js";
import { emitBatchMigrationItemEvents } from "../../finalize/emitBatchMigrationItemEvents.js";
import { invalidateBatchMigrationCaches } from "../../finalize/invalidateBatchMigrationCaches.js";
import type { BatchMigrationExecutionPlan } from "../../types/index.js";
import type { BatchMigrationPageResult } from "../types/batchMigrationExecutionTypes.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../utils/pagePhaseTimings.js";

/** Post-commit side effects for one finalized page, in order. */
export const finalizeBatchMigrationPage = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	plan,
	pageResult,
	webhooks,
	phases,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	pageResult: BatchMigrationPageResult;
	webhooks?: MigrationWebhookControls;
	phases?: BatchMigrationPagePhases;
}): Promise<void> => {
	const cachesInvalidated = await timePhase({
		phases,
		phase: "finalize_caches",
		run: () => invalidateBatchMigrationCaches({ ctx, pageResult }),
	});
	const { eventCount } = await timePhase({
		phases,
		phase: "finalize_events",
		run: () =>
			emitBatchMigrationItemEvents({
				ctx,
				migrationInternalId,
				migrationRunId,
				plan,
				pageResult,
			}),
	});
	const webhookRecords = webhooks?.sendWebhooks
		? await timePhase({
				phases,
				phase: "finalize_webhook_build",
				run: async () =>
					buildBatchMigrationWebhookRecords({
						pageResult,
						plan,
						features: ctx.features,
					}),
			})
		: [];
	const webhookBatches =
		webhookRecords.length > 0
			? await timePhase({
					phases,
					phase: "finalize_webhook_queue",
					run: () =>
						queueMigrationWebhooks({
							ctx,
							migrationRunId,
							controls: webhooks,
							records: webhookRecords,
						}),
				})
			: 0;

	ctx.logger.debug("batch-migration: page finalized", {
		data: {
			migrationInternalId,
			migrationRunId,
			succeeded: pageResult.succeeded.length,
			skipped: pageResult.skipped.length,
			cachesInvalidated,
			eventsEmitted: eventCount,
			webhookBatches,
		},
	});
};
