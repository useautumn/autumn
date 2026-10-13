import * as Sentry from "@sentry/bun";

/** Waits for queued Sentry events to send; call before the process exits or they are dropped. */
export const flushErrorReports = async ({
	timeoutMs,
}: {
	timeoutMs: number;
}): Promise<void> => {
	await Sentry.flush(timeoutMs);
};
