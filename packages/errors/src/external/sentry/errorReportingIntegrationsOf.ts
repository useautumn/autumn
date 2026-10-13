// Each wraps every request (Bun.serve proxy, span attributes) or patches require through require-in-the-middle.
const REQUEST_TRACING_INTEGRATIONS = new Set([
	"BunServer",
	"Http",
	"NodeFetch",
	"RequestData",
]);

/** Sentry's defaults with `rejectionHandler` in place of its own, and without the per-request tracers unless asked for. */
export function errorReportingIntegrationsOf<
	Integration extends { name: string },
>({
	defaults,
	rejectionHandler,
	tracesRequests,
}: {
	defaults: Integration[];
	rejectionHandler: Integration;
	tracesRequests: boolean;
}): Integration[] {
	function isKept(integration: Integration): boolean {
		const isReplaced = integration.name === rejectionHandler.name;
		const tracesEachRequest =
			!tracesRequests && REQUEST_TRACING_INTEGRATIONS.has(integration.name);
		return !isReplaced && !tracesEachRequest;
	}
	return [...defaults.filter(isKept), rejectionHandler];
}
