/**
 * S4a contract: a string condition always reads as something, including the
 * empty string, so a matched limit is never blank.
 *
 * Red (before):  `$ne: ""` and `$eq: ""` were dropped as falsy, leaving `limit: ""`.
 * Green (after): each matcher reads as listed.
 */

import { describe, expect, test } from "bun:test";
import { describeStringMatcher } from "@autumn/shared/api/approvals/evaluate/filter/format/describeStringMatcher.js";
import type { StringMatcher } from "@autumn/shared/api/common/filters/matcher.js";

describe("describeStringMatcher", () => {
	test.each<{ matcher: StringMatcher; expected: string }>([
		{ matcher: "pro", expected: "pro" },
		{ matcher: null, expected: "none" },
		{ matcher: { $eq: "" }, expected: '""' },
		{ matcher: { $ne: "" }, expected: 'not ""' },
		{ matcher: { $ne: "cus_vip" }, expected: "not cus_vip" },
		{ matcher: { $ne: null }, expected: "any" },
		{ matcher: { $in: ["a", "b"] }, expected: "a or b" },
		{ matcher: { $nin: ["a"] }, expected: "not a" },
	])("$expected", ({ matcher, expected }) => {
		expect(describeStringMatcher({ matcher })).toBe(expected);
	});
});
