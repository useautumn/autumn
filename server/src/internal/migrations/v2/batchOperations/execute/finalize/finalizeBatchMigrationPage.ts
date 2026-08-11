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

/** Post-commit side effects for one finalized page.
 *
 * Cache invalidation and item-event emission are independent, so they run
 * concurrently. Either can be handed to the caller to drain at chunk end
 * instead of blocking the page — pages touch disjoint customers, so they
 * overlap safely. A deferred invalidation must still complete, so the caller
 * drains before finishing. */
export const finalizeBatchMigrationPage = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	plan,
	pageResult,
	webhooks,
	phases,
	deferEvents,
	deferCaches,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	migrationRunId: string;
	plan: BatchMigrationExecutionPlan;
	pageResult: BatchMigrationPageResult;
	webhooks?: MigrationWebhookControls;
	phases?: BatchMigrationPagePhases;
	deferEvents?: (emit: () => Promise<unknown>) => void;
	deferCaches?: (invalidate: () => Promise<unknown>) => void;
}): Promise<void> => {
	const emitEvents = () =>
		emitBatchMigrationItemEvents({
			ctx,
			migrationInternalId,
			migrationRunId,
			plan,
			pageResult,
		});

	const invalidateCaches = () =>
		invalidateBatchMigrationCaches({ ctx, pageResult });

	const runCaches = async () => {
		if (!deferCaches)
			return timePhase({
				phases,
				phase: "finalize_caches",
				run: invalidateCaches,
			});
		deferCaches(invalidateCaches);
		return null;
	};
	const runEvents = async () => {
		if (!deferEvents)
			return timePhase({ phases, phase: "finalize_events", run: emitEvents });
		deferEvents(emitEvents);
		return undefined;
	};

	const [cachesInvalidated, emitted] = await Promise.all([
		runCaches(),
		runEvents(),
	]);
	const eventCount = emitted?.eventCount ?? null;
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
