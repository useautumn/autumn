import * as Sentry from "@sentry/bun";
import { errorReportingIntegrationsOf } from "./errorReportingIntegrationsOf.js";
import { errorReportingOptionsOf } from "./errorReportingOptionsOf.js";

export const initErrorReporting = ({
	tracesRequests = true,
	ownsProcessErrors = true,
}: {
	tracesRequests?: boolean;
	/** False leaves uncaught errors to the host runtime (e.g. Trigger's worker) instead of Sentry exiting the process. */
	ownsProcessErrors?: boolean;
} = {}): boolean => {
	const options = errorReportingOptionsOf();
	if (!options) return false;
	// Sentry's default "warn" mode keeps the process alive; "strict" reports, then exits as Bun would have.
	const rejectionHandler = ownsProcessErrors
		? Sentry.onUnhandledRejectionIntegration({ mode: "strict" })
		: undefined;
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
