import { describe, expect, test } from "bun:test";
import { isRetryableEveStreamError } from "../../../src/harness/eve/streamErrors.js";

describe("isRetryableEveStreamError", () => {
	test("recognizes the production Bun socket closure", () => {
		expect(
			isRetryableEveStreamError(
				new Error(
					"The socket connection was closed unexpectedly. For more information, pass verbose: true in the second argument to fetch()",
				),
			),
		).toBe(true);
	});

	test("does not retry application and parsing failures", () => {
		expect(isRetryableEveStreamError(new Error("Eve stream failed: 401"))).toBe(
			false,
		);
		expect(isRetryableEveStreamError(new SyntaxError("Invalid JSON"))).toBe(
			false,
		);
	});
});
