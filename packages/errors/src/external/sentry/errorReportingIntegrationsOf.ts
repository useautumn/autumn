// Each wraps every request (Bun.serve proxy, span attributes) or patches require through require-in-the-middle.
const REQUEST_TRACING_INTEGRATIONS = new Set([
	"BunServer",
	"Http",
	"NodeFetch",
	"RequestData",
]);

// Each installs a process-level handler that can exit the process.
const PROCESS_ERROR_INTEGRATIONS = new Set([
	"OnUncaughtException",
	"OnUnhandledRejection",
]);

/** Sentry's defaults with `rejectionHandler` in place of its own; without one, the host keeps its process handlers. */
export function errorReportingIntegrationsOf<
	Integration extends { name: string },
>({
	defaults,
	rejectionHandler,
	tracesRequests,
}: {
	defaults: Integration[];
	rejectionHandler?: Integration;
	tracesRequests: boolean;
}): Integration[] {
	function isKept(integration: Integration): boolean {
		const handlesProcessErrors = PROCESS_ERROR_INTEGRATIONS.has(
			integration.name,
		);
		const isReplaced =
			rejectionHandler === undefined
				? handlesProcessErrors
				: integration.name === rejectionHandler.name;
		const tracesEachRequest =
			!tracesRequests && REQUEST_TRACING_INTEGRATIONS.has(integration.name);
		return !isReplaced && !tracesEachRequest;
	}
	const kept = defaults.filter(isKept);
	return rejectionHandler ? [...kept, rejectionHandler] : kept;
}
