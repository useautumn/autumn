import type { Logger } from "@/external/logtail/logtailUtils.js";
import { retryBoundedAsync } from "@/utils/retryBoundedAsync.js";
import { billingVerifyExportConfig } from "./billingVerifyExportConfig.js";

/** A page read that throws aborts the generator and restarts the whole export,
 * so a dead pooled connection has to be survivable here rather than fatal. */
export const retryExportDbRead = async <T>({
	logger,
	operation,
	run,
}: {
	logger: Logger;
	operation: string;
	run: () => Promise<T>;
}): Promise<T> => {
	const { timeoutMs, attempts, retryDelayMs, maxRetryDelayMs } =
		billingVerifyExportConfig.customer;

	return retryBoundedAsync({
		attempts,
		delayMs: retryDelayMs,
		maxDelayMs: maxRetryDelayMs,
		timeoutMs,
		timeoutMessage: `${operation} timed out after ${timeoutMs}ms`,
		shouldRetry: () => true,
		run,
		onRetry: ({ attempt, error }) =>
			logger.warn("customer-export: retrying db read", {
				data: {
					operation,
					attempt,
					error: error instanceof Error ? error.message : String(error),
				},
			}),
	});
};
