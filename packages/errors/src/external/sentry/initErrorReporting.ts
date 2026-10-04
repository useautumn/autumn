import * as Sentry from "@sentry/bun";

// Each one wraps every request (Bun.serve proxy, span attributes) or patches require via require-in-the-middle.
const REQUEST_TRACING_INTEGRATIONS = new Set([
	"BunServer",
	"Http",
	"NodeFetch",
	"RequestData",
]);

/** Starts Sentry when a DSN is configured; without one, the logger hook's captures are no-ops. */
export const initErrorReporting = ({
	dsn = process.env.SENTRY_DSN,
	tracesRequests = true,
}: {
	dsn?: string;
	tracesRequests?: boolean;
} = {}): boolean => {
	if (!dsn) return false;
	// Sentry's default "warn" mode keeps the process alive; "strict" reports, then exits as Bun would have.
	const strictRejections = Sentry.onUnhandledRejectionIntegration({
		mode: "strict",
	});
	Sentry.init({
		dsn,
		sendDefaultPii: true,
		skipOpenTelemetrySetup: true,
		integrations: tracesRequests
			? [strictRejections]
			: (defaults) => [
					...defaults.filter(
						(integration) =>
							!REQUEST_TRACING_INTEGRATIONS.has(integration.name) &&
							integration.name !== strictRejections.name,
					),
					strictRejections,
				],
	});
	return true;
};
