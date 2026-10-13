import { describe, expect, it } from "bun:test";
import { errorReportingIntegrationsOf } from "../../../../src/external/sentry/errorReportingIntegrationsOf.js";

const defaults = [
	"BunServer",
	"Http",
	"NodeFetch",
	"RequestData",
	"OnUnhandledRejection",
	"LinkedErrors",
].map((name) => ({ name, mode: "default" }));

function namesOf({ tracesRequests }: { tracesRequests: boolean }): string[] {
	return errorReportingIntegrationsOf({
		defaults,
		rejectionHandler: { name: "OnUnhandledRejection", mode: "strict" },
		tracesRequests,
	}).map((integration) => integration.name);
}

describe("errorReportingIntegrationsOf", () => {
	it("keeps every default and puts the given rejection handler in place of Sentry's", () => {
		expect(namesOf({ tracesRequests: true })).toEqual([
			"BunServer",
			"Http",
			"NodeFetch",
			"RequestData",
			"LinkedErrors",
			"OnUnhandledRejection",
		]);
	});

	it("without request tracing keeps error capture and drops what wraps every request", () => {
		expect(namesOf({ tracesRequests: false })).toEqual([
			"LinkedErrors",
			"OnUnhandledRejection",
		]);
	});
});
