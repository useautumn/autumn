import { expect, test } from "bun:test";
import { removeInternalFields } from "./removeInternalFields.js";

test("drops x-internal operations and their now-empty path items", () => {
	const openApiDocument: Record<string, unknown> = {
		paths: {
			"/v1/customers.advance_test_clock": {
				post: { operationId: "advanceTestClock" },
			},
			"/v1/billing.advance_test_clock": {
				post: { operationId: "billingAdvanceTestClock", "x-internal": true },
			},
		},
	};
	removeInternalFields({ openApiDocument });
	expect(Object.keys(openApiDocument.paths as object)).toEqual([
		"/v1/customers.advance_test_clock",
	]);
});
