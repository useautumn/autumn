import {
	type CreateCustomerExportParams,
	type CustomerExportResponse,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCustomerExportTriggerOptions } from "@/trigger/exports/customerExportQueue.js";
import {
	customerExportTask,
	executeCustomerExport,
} from "@/trigger/exports/customerExportTask.js";
import { shouldRunTriggerTasksInline } from "@/trigger/utils/shouldRunTriggerTasksInline.js";
import { CustomerExportService } from "../CustomerExportService.js";
import { getCustomerExportErrorMessage } from "../customerExportErrorMessage.js";
import { cacheCustomerExportRealtimeToken } from "../customerExportRealtimeToken.js";
import { customerExportToResponse } from "../customerExportToResponse.js";
import { createExportReclaimingStale } from "../reclaimStaleCustomerExport.js";

export const startCustomerExport = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateCustomerExportParams;
}): Promise<{ export: CustomerExportResponse }> => {
	const { fields, search, filters } = params;
	const result = await createExportReclaimingStale({
		db: ctx.db,
		logger: ctx.logger,
		orgId: ctx.org.id,
		env: ctx.env,
		fields,
		// The dashboard trims client-side; trimming here keeps direct API callers consistent.
		snapshot: { search: search.trim(), filters },
		requestedByUserId: ctx.userId ?? ctx.user?.id,
	});

	if (!result.created) {
		throw new RecaseError({
			message:
				"A customer export is already running. Wait for it to finish before starting another.",
			code: ErrCode.CustomerExportInProgress,
			statusCode: 409,
		});
	}

	const { customerExport } = result;
	const payload = {
		exportId: customerExport.id,
		orgId: ctx.org.id,
		env: ctx.env,
	};
	// Inline runs have no Trigger run to subscribe to, so clients keep polling.
	let triggerRunId: string | null = null;
	let publicAccessToken: string | null = null;

	if (shouldRunTriggerTasksInline()) {
		ctx.logger.warn(
			"customer-export: trigger.dev not configured — running export inline",
			{ data: { exportId: customerExport.id } },
		);
		const inlineCtx = { ...ctx, insideTriggerTask: true };
		void executeCustomerExport({
			ctx: inlineCtx,
			logger: ctx.logger,
			payload,
		}).catch((error) => {
			ctx.logger.error("customer-export: inline execution failed", {
				data: {
					exportId: customerExport.id,
					error: getCustomerExportErrorMessage({ error }),
				},
			});
		});
	} else {
		let handle: Awaited<ReturnType<typeof customerExportTask.trigger>>;
		try {
			handle = await customerExportTask.trigger(payload, {
				idempotencyKey: `customer-export:${customerExport.id}`,
				idempotencyKeyTTL: "7d",
				...getCustomerExportTriggerOptions({
					isDev: process.env.NODE_ENV === "development",
				}),
			});
		} catch (error) {
			// A queued row without a job would block later exports for the org.
			await CustomerExportService.markFailed({
				db: ctx.db,
				id: customerExport.id,
				errorMessage: "Failed to enqueue the export job",
			});
			throw error;
		}

		triggerRunId = handle.id;
		publicAccessToken = handle.publicAccessToken;
		cacheCustomerExportRealtimeToken({
			triggerRunId: handle.id,
			token: handle.publicAccessToken,
		});

		// The job is already enqueued, so persistence failure cannot fail the export.
		try {
			await CustomerExportService.setTriggerRunId({
				db: ctx.db,
				id: customerExport.id,
				triggerRunId: handle.id,
			});
		} catch (error) {
			ctx.logger.error("customer-export: failed to persist trigger run id", {
				data: {
					exportId: customerExport.id,
					triggerRunId: handle.id,
					error: getCustomerExportErrorMessage({ error }),
				},
			});
		}
	}

	return {
		export: customerExportToResponse({
			customerExport,
			triggerRunId,
			publicAccessToken,
		}),
	};
};
