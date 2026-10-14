import type { Logger } from "@/external/logtail/logtailUtils.js";
import { retryBoundedAsync } from "@/utils/retryBoundedAsync.js";
import {
	billingVerifyExportConfig,
	type CustomerLimits,
} from "./billingVerifyExportConfig.js";

export const retryExportDbRead =
	<Params, Result>({
		logger,
		operation,
		query,
		limits,
	}: {
		logger: Logger;
		operation: string;
		query: (params: Params) => Promise<Result>;
		limits?: CustomerLimits;
	}) =>
	(params: Params): Promise<Result> => {
		const { timeoutMs, attempts, retryDelayMs, maxRetryDelayMs } = {
			...billingVerifyExportConfig.customer,
			...limits,
		};

		return retryBoundedAsync({
			attempts,
			delayMs: retryDelayMs,
			maxDelayMs: maxRetryDelayMs,
			timeoutMs,
			timeoutMessage: `${operation} timed out after ${timeoutMs}ms`,
			shouldRetry: () => true,
			run: () => query(params),
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
