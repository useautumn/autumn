import { describe, expect, test } from "bun:test";
import { isMissingSessionApiError } from "../../../src/harness/common/deadSession.js";

describe("isMissingSessionApiError", () => {
	test("recognises a 404 from the sessions API", () => {
		expect(
			isMissingSessionApiError(
				Object.assign(new Error("Not Found"), { status: 404 }),
			),
		).toBe(true);
	});

	test("recognises a not-found message without a status", () => {
		expect(
			isMissingSessionApiError(new Error("Session sesn_1 not found")),
		).toBe(true);
	});

	test("recognises a 400 invalid-session-id rejection", () => {
		expect(
			isMissingSessionApiError(
				Object.assign(
					new Error(
						'400 {"type":"error","error":{"type":"invalid_request_error","message":"Invalid session ID: session_dead_test"}}',
					),
					{ status: 400 },
				),
			),
		).toBe(true);
	});

	test("does not swallow unrelated failures", () => {
		expect(
			isMissingSessionApiError(
				Object.assign(new Error("Overloaded"), { status: 529 }),
			),
		).toBe(false);
		expect(isMissingSessionApiError(new Error("customer not found"))).toBe(
			false,
		);
	});
});
