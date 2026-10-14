import { LOG_FLUSH_TIMEOUT_MS } from "@autumn/logging";
import * as Sentry from "@sentry/bun";

/** Waits for queued Sentry events to send; call before the process exits or they are dropped. */
export const flushErrorReports = async ({
	timeoutMs = LOG_FLUSH_TIMEOUT_MS,
}: {
	timeoutMs?: number;
} = {}): Promise<void> => {
	await Sentry.flush(timeoutMs);
};
