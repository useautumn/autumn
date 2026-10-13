import * as Sentry from "@sentry/bun";
import { errorReportingIntegrationsOf } from "./errorReportingIntegrationsOf.js";
import { errorReportingOptionsOf } from "./errorReportingOptionsOf.js";

/** Starts the Sentry SDK when a Sazabi or Sentry DSN is configured; without one, the logger hook's captures are no-ops. */
export const initErrorReporting = ({
	tracesRequests = true,
}: {
	/** False keeps error capture but drops the integrations that wrap every request. */
	tracesRequests?: boolean;
} = {}): boolean => {
	const options = errorReportingOptionsOf();
	if (!options) return false;
	// Sentry's default "warn" mode keeps the process alive; "strict" reports, then exits as Bun would have.
	const rejectionHandler = Sentry.onUnhandledRejectionIntegration({
		mode: "strict",
	});
	Sentry.init({
		...options,
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
