import {
	CUSTOMER_EXPORT_PROCESSED_ROWS_KEY,
	CUSTOMER_EXPORT_TOTAL_ROWS_KEY,
} from "@autumn/shared";
import { metadata, task } from "@trigger.dev/sdk/v3";
import { executeCustomerExport } from "@/internal/customers/exports/workflows/executeCustomerExport.js";
import {
	CUSTOMER_EXPORT_MAX_DURATION_SECONDS,
	CUSTOMER_EXPORT_PARENT_RETRY,
	customerExportParentQueue,
} from "@/trigger/exports/customerExportQueue.js";
import { RunCustomerExportPayloadSchema } from "@/trigger/exports/customerExportTaskPayload.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

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
});
