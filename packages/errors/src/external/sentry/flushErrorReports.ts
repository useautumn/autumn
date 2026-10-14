import { LOG_FLUSH_TIMEOUT_MS } from "@autumn/logging";
import * as Sentry from "@sentry/bun";

export const flushErrorReports = async ({
	timeoutMs = LOG_FLUSH_TIMEOUT_MS,
}: {
	timeoutMs?: number;
} = {}): Promise<void> => {
	await Sentry.flush(timeoutMs);
};
