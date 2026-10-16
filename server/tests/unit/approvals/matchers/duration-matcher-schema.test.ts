/**
 * S2a contract: `DurationMatcherSchema` is `{ $eq|$lt|$lte|$gt|$gte: { length, unit } }`
 * with whole, positive lengths, at least one operator, and no unknown keys.
 *
 * Red (before):  `DurationMatcherSchema` doesn't exist.
 * Green (after): each row parses or fails as listed.
 */

import { describe, expect, test } from "bun:test";
import { DurationMatcherSchema } from "@autumn/shared/api/common/filters/durationMatcher.js";

const twoMonths = { length: 2, unit: "month" } as const;

describe("DurationMatcherSchema", () => {
	test.each(["$eq", "$lt", "$lte", "$gt", "$gte"])("accepts %s", (operator) => {
		expect(
			DurationMatcherSchema.safeParse({ [operator]: twoMonths }).success,
		).toBe(true);
	});

	test("accepts a range", () => {
		const range = {
			$gte: { length: 7, unit: "day" },
			$lt: { length: 1, unit: "month" },
		} as const;
		expect(DurationMatcherSchema.safeParse(range)).toEqual({
			success: true,
			data: range,
		});
	});

	test.each([
		{ name: "zero length", value: { $lt: { length: 0, unit: "month" } } },
		{
			name: "fractional length",
			value: { $lt: { length: 1.5, unit: "month" } },
		},
		{ name: "unknown unit", value: { $lt: { length: 2, unit: "week" } } },
		{ name: "no operator", value: {} },
		{ name: "unknown operator", value: { $ne: twoMonths } },
		{
			name: "unknown key in a bound",
			value: { $lt: { ...twoMonths, days: 3 } },
		},
		{ name: "a bare number", value: 60 },
	])("rejects $name", ({ value }) => {
		expect(DurationMatcherSchema.safeParse(value).success).toBe(false);
	});
});
