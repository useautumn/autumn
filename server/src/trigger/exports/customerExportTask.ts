import {
	CUSTOMER_EXPORT_PROCESSED_ROWS_KEY,
	CUSTOMER_EXPORT_TOTAL_ROWS_KEY,
} from "@autumn/shared";
import { metadata, task } from "@trigger.dev/sdk/v3";
import { db } from "@/db/initDrizzle.js";
import { createDualLogger } from "@/external/logtail/logtailUtils.js";
import { failCustomerExportRun } from "@/internal/customers/exports/workflows/complete/failCustomerExportRun.js";
import { executeCustomerExport } from "@/internal/customers/exports/workflows/executeCustomerExport.js";
import {
	CUSTOMER_EXPORT_MAX_DURATION_SECONDS,
	CUSTOMER_EXPORT_PARENT_RETRY,
	customerExportParentQueue,
} from "@/trigger/exports/customerExportQueue.js";
import { RunCustomerExportPayloadSchema } from "@/trigger/exports/customerExportTaskPayload.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";
import { addTriggerToLogs } from "@/utils/logging/addContextToLogs.js";

export const customerExportTask = task({
	id: "customer-export",
	queue: customerExportParentQueue,
	retry: CUSTOMER_EXPORT_PARENT_RETRY,
	machine: "medium-1x",
	maxDuration: CUSTOMER_EXPORT_MAX_DURATION_SECONDS,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = RunCustomerExportPayloadSchema.parse(rawPayload);
		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		await executeCustomerExport({
			ctx,
			logger,
			payload,
			isFinalAttempt:
				triggerCtx.attempt.number >= CUSTOMER_EXPORT_PARENT_RETRY.maxAttempts,
			progress: {
				setTotalRows: (rowCount) => {
					metadata.set(CUSTOMER_EXPORT_TOTAL_ROWS_KEY, rowCount);
				},
				resetProcessedRows: () => {
					metadata.set(CUSTOMER_EXPORT_PROCESSED_ROWS_KEY, 0);
				},
				incrementProcessedRows: async (rowCount) => {
					await metadata.increment(
						CUSTOMER_EXPORT_PROCESSED_ROWS_KEY,
						rowCount,
					);
				},
			},
		});
	},

	// Runs once retries are exhausted. Deliberately avoids createTriggerContext,
	// which is itself a way `run` fails, and writes through the raw pool instead.
	onFailure: async ({ payload, error, ctx: triggerCtx }) => {
		await failCustomerExportRun({
			db,
			logger: addTriggerToLogs({
				logger: createDualLogger(),
				triggerContext: {
					run_id: triggerCtx.run.id,
					task_id: triggerCtx.task.id,
					attempt_number: triggerCtx.attempt.number,
				},
			}),
			rawPayload: payload,
			error,
		});
	},
});
