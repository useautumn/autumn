import { ms } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { RunCustomerExportPayloadSchema } from "@/trigger/exports/customerExportTaskPayload.js";
import { retryAsync } from "@/utils/retryAsync.js";
import { CustomerExportService } from "../../CustomerExportService.js";

// Shorter than the completion retry: the run has already failed and lifecycle
// hooks are a poor place to sit, whereas a lost write is reclaimable.
const MARK_FAILED_ATTEMPTS = 3;
const MARK_FAILED_RETRY_DELAY_MS = ms.seconds(1);

/** The row's message is a dashboard tooltip, so the raw cause only goes to logs. */
const RUN_FAILED_MESSAGE = "Export job failed unexpectedly";

const describeError = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

/**
 * Terminal write for a run that threw outside the upload. Trigger skips its
 * failure hook on timeout, cancellation and OOM, which stay reclaim-only.
 */
export const failCustomerExportRun = async ({
	db,
	logger,
	rawPayload,
	error,
}: {
	db: DrizzleCli;
	logger: Logger;
	rawPayload: unknown;
	error: unknown;
}): Promise<void> => {
	const cause = describeError(error);

	// No exportId means no row to fail; the stale reclaim path is the only recovery.
	const parsed = RunCustomerExportPayloadSchema.safeParse(rawPayload);
	if (!parsed.success) {
		logger.error("customer-export: run failed with an unreadable payload", {
			data: { cause, payloadError: parsed.error.message },
		});
		return;
	}

	const { exportId } = parsed.data;

	try {
		const failed = await retryAsync({
			attempts: MARK_FAILED_ATTEMPTS,
			delayMs: MARK_FAILED_RETRY_DELAY_MS,
			onRetry: ({ attempt, error: retryError }) =>
				logger.warn("customer-export: retrying markFailedIfActive", {
					data: { exportId, attempt, error: describeError(retryError) },
				}),
			run: () =>
				CustomerExportService.markFailedIfActive({
					db,
					id: exportId,
					errorMessage: RUN_FAILED_MESSAGE,
				}),
		});

		logger.error("customer-export: run failed", {
			data: { exportId, cause, markedFailed: failed },
		});
	} catch (writeError) {
		// Rethrowing would only replace the real cause; the row is reclaimable.
		logger.error("customer-export: could not record the failed run", {
			data: { exportId, cause, error: describeError(writeError) },
		});
	}
};
