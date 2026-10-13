import * as Sentry from "@sentry/bun";
import { errorReportingIntegrationsOf } from "./errorReportingIntegrationsOf.js";

/** Starts Sentry when a DSN is configured; without one, the logger hook's captures are no-ops. */
export const initErrorReporting = ({
	dsn = process.env.SENTRY_DSN,
	tracesRequests = true,
}: {
	dsn?: string;
	/** False keeps error capture but drops the integrations that wrap every request. */
	tracesRequests?: boolean;
} = {}): boolean => {
	if (!dsn) return false;
	// Sentry's default "warn" mode keeps the process alive; "strict" reports, then exits as Bun would have.
	const rejectionHandler = Sentry.onUnhandledRejectionIntegration({
		mode: "strict",
	});
	Sentry.init({
		dsn,
		sendDefaultPii: true,
		skipOpenTelemetrySetup: true,
		integrations: (defaults) =>
			errorReportingIntegrationsOf({
				defaults,
				rejectionHandler,
				tracesRequests,
			}),
	});
	return true;
};
