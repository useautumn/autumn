import {
	type CreateCustomerExportParams,
	type CustomerExportResponse,
	type DbCustomerExport,
	ErrCode,
	ms,
	RecaseError,
} from "@autumn/shared";
import { getCustomerExportsS3Config } from "@/external/aws/s3/customerExportsS3Config.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCustomerExportTriggerOptions } from "@/trigger/exports/customerExportQueue.js";
import { customerExportTask } from "@/trigger/exports/customerExportTask.js";
import type { RunCustomerExportPayload } from "@/trigger/exports/customerExportTaskPayload.js";
import { shouldRunTriggerTasksInline } from "@/trigger/utils/shouldRunTriggerTasksInline.js";
import { retryAsync } from "@/utils/retryAsync.js";
import { CustomerExportService } from "../CustomerExportService.js";
import { customerExportToResponse } from "../customerExportToResponse.js";
import { createExportReclaimingStale } from "../reclaimStaleCustomerExport.js";
import { executeCustomerExport } from "../workflows/executeCustomerExport.js";

const TRIGGER_ENQUEUE_ATTEMPTS = 3;
const TRIGGER_ENQUEUE_RETRY_DELAY_MS = ms.seconds(1);

// A lost response does not mean the enqueue failed; the stable idempotency key
// makes a retry return the already-created run instead of duplicating it.
const triggerCustomerExportWithRetry = async ({
	logger,
	exportId,
	payload,
}: {
	logger: Logger;
	exportId: string;
	payload: RunCustomerExportPayload;
}) =>
	retryAsync({
		attempts: TRIGGER_ENQUEUE_ATTEMPTS,
		delayMs: TRIGGER_ENQUEUE_RETRY_DELAY_MS,
		onRetry: ({ attempt, error }) =>
			logger.warn("customer-export: retrying trigger enqueue", {
				data: {
					exportId,
					attempt,
					error: error instanceof Error ? error.message : String(error),
				},
			}),
		run: () =>
			customerExportTask.trigger(payload, {
				idempotencyKey: `customer-export:${exportId}`,
				idempotencyKeyTTL: "7d",
				...getCustomerExportTriggerOptions({
					isDev: process.env.NODE_ENV === "development",
				}),
			}),
	});

/** Inline runs have no Trigger run to subscribe to, so clients keep polling. */
const runExportInline = ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: RunCustomerExportPayload;
}) => {
	ctx.logger.warn(
		"customer-export: trigger.dev not configured — running export inline",
		{ data: { exportId: payload.exportId } },
	);
	const inlineCtx = { ...ctx, insideTriggerTask: true };
	void executeCustomerExport({
		ctx: inlineCtx,
		logger: ctx.logger,
		payload,
	}).catch((error) => {
		ctx.logger.error("customer-export: inline execution failed", {
			data: {
				exportId: payload.exportId,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	});
};

const enqueueExportRun = async ({
	ctx,
	customerExport,
	payload,
}: {
	ctx: AutumnContext;
	customerExport: DbCustomerExport;
	payload: RunCustomerExportPayload;
}): Promise<{ triggerRunId: string; publicAccessToken: string }> => {
	let handle: Awaited<ReturnType<typeof customerExportTask.trigger>>;
	try {
		handle = await triggerCustomerExportWithRetry({
			logger: ctx.logger,
			exportId: customerExport.id,
			payload,
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
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}

	return {
		triggerRunId: handle.id,
		publicAccessToken: handle.publicAccessToken,
	};
};

export const startCustomerExport = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateCustomerExportParams;
}): Promise<{ export: CustomerExportResponse }> => {
	const { fields, search, filters } = params;
	// Fail before creating a row a worker without S3 config could never publish.
	getCustomerExportsS3Config();

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

	if (shouldRunTriggerTasksInline()) {
		runExportInline({ ctx, payload });
		return {
			export: customerExportToResponse({
				customerExport,
				triggerRunId: null,
				publicAccessToken: null,
			}),
		};
	}

	const { triggerRunId, publicAccessToken } = await enqueueExportRun({
		ctx,
		customerExport,
		payload,
	});

	return {
		export: customerExportToResponse({
			customerExport,
			triggerRunId,
			publicAccessToken,
		}),
	};
};
