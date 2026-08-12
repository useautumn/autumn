import { describe, expect, test } from "bun:test";
import {
	EveSessionRequestError,
	isEveInputResponseRehomeRefusal,
} from "../../../src/harness/eve/streamErrors.js";

describe("EveSessionRequestError", () => {
	test("carries the status and body eve explained itself with", () => {
		const error = new EveSessionRequestError({
			body: 'Cannot deliver inputResponses to a new run for session "s_1"',
			status: 400,
		});

		expect(error.status).toBe(400);
		expect(error.message).toContain("400");
		expect(error.message).toContain("Cannot deliver inputResponses");
	});
});

describe("isEveInputResponseRehomeRefusal", () => {
	test("recognises eve refusing to re-home an answer", () => {
		expect(
			isEveInputResponseRehomeRefusal(
				new EveSessionRequestError({
					body: "Cannot deliver inputResponses to a new run",
					status: 400,
				}),
			),
		).toBe(true);
	});

	test("does not match other session failures", () => {
		expect(
			isEveInputResponseRehomeRefusal(
				new EveSessionRequestError({ body: "internal error", status: 500 }),
			),
		).toBe(false);
		expect(isEveInputResponseRehomeRefusal(new Error("network down"))).toBe(
			false,
		);
	});
});
