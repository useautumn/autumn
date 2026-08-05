import { ms } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { retryAsync } from "@/utils/retryAsync.js";
import { CustomerExportService } from "../../CustomerExportService.js";

const MARK_COMPLETED_ATTEMPTS = 3;
const MARK_COMPLETED_RETRY_DELAY_MS = ms.seconds(2);

/**
 * The object is already published, so transient status writes are retried.
 * Returns false when the row left its active state, so callers must not report success.
 */
export const markCompletedWithRetry = async ({
	ctx,
	logger,
	exportId,
	rowCount,
	byteCount,
}: {
	ctx: AutumnContext;
	logger: Logger;
	exportId: string;
	rowCount: number | null;
	byteCount: number | null;
}): Promise<boolean> =>
	retryAsync({
		attempts: MARK_COMPLETED_ATTEMPTS,
		delayMs: MARK_COMPLETED_RETRY_DELAY_MS,
		onRetry: ({ attempt, error }) =>
			logger.warn("customer-export: retrying markCompleted", {
				data: {
					exportId,
					attempt,
					error: error instanceof Error ? error.message : String(error),
				},
			}),
		run: async () => {
			const completed = await CustomerExportService.markCompleted({
				db: ctx.db,
				id: exportId,
				rowCount,
				byteCount,
			});
			if (!completed) {
				logger.warn("customer-export: row left its active state mid-run", {
					data: { exportId },
				});
			}
			return completed;
		},
	});
