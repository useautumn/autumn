import * as Sentry from "@sentry/bun";

/** Starts Sentry when a DSN is configured; without one, the logger hook's captures are no-ops. */
export const initErrorReporting = ({
	dsn = process.env.SENTRY_DSN,
}: {
	dsn?: string;
} = {}): boolean => {
	if (!dsn) return false;
	Sentry.init({
		dsn,
		sendDefaultPii: true,
		skipOpenTelemetrySetup: true,
		// Sentry's default "warn" mode keeps the process alive; "strict" reports, then exits as Bun would have.
		integrations: [Sentry.onUnhandledRejectionIntegration({ mode: "strict" })],
	});
	return true;
};
