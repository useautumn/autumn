import { describe, expect, test } from "bun:test";
import { describeNumberMatcher } from "@autumn/shared/api/approvals/evaluate/filter/format/describeNumberMatcher.js";

describe("describeNumberMatcher", () => {
	test("an empty matcher reads as any amount", () => {
		expect(describeNumberMatcher({ matcher: {} })).toBe("any amount");
	});
});
