/**
 * S2a contract: `durationMatcherMatches` compares a duration with a limit on the
 * calendar, both measured from the same start, the way billing measures trials.
 *
 * Red (before):  `durationMatcherMatches` doesn't exist.
 * Green (after): every row matches the calendar answer.
 */

import { describe, expect, test } from "bun:test";
import type { DurationMatcher } from "@autumn/shared/api/common/filters/durationMatcher.js";
import { durationMatcherMatches } from "@autumn/shared/api/common/filters/match/durationMatcherMatches.js";

const JAN_1 = Date.UTC(2026, 0, 1);
const FEB_1 = Date.UTC(2026, 1, 1);
const JUL_1 = Date.UTC(2026, 6, 1);

const month = (length: number) => ({ length, unit: "month" as const });
const day = (length: number) => ({ length, unit: "day" as const });

const CASES: {
	name: string;
	matcher: DurationMatcher;
	duration: { length: number; unit: "day" | "month" | "year" } | null;
	startsAt: number;
	expected: boolean;
}[] = [
	{
		name: "31 days ≤ 1 month from Jan 1 (both end Feb 1)",
		matcher: { $lte: month(1) },
		duration: day(31),
		startsAt: JAN_1,
		expected: true,
	},
	{
		name: "31 days ≤ 1 month from Feb 1 (Mar 4 is after Mar 1)",
		matcher: { $lte: month(1) },
		duration: day(31),
		startsAt: FEB_1,
		expected: false,
	},
	{
		name: "1 month = 1 month from Jan 31",
		matcher: { $eq: month(1) },
		duration: month(1),
		startsAt: Date.UTC(2026, 0, 31),
		expected: true,
	},
	{
		name: "1 month = 1 month from Feb 28",
		matcher: { $eq: month(1) },
		duration: month(1),
		startsAt: Date.UTC(2026, 1, 28),
		expected: true,
	},
	{
		name: "1 month = 1 month from Mar 15",
		matcher: { $eq: month(1) },
		duration: month(1),
		startsAt: Date.UTC(2026, 2, 15),
		expected: true,
	},
	{
		name: "60 days < 2 months from Jan 1 (Mar 2 vs Mar 1)",
		matcher: { $lt: month(2) },
		duration: day(60),
		startsAt: JAN_1,
		expected: false,
	},
	{
		name: "60 days < 2 months from Jul 1 (Aug 30 vs Sep 1)",
		matcher: { $lt: month(2) },
		duration: day(60),
		startsAt: JUL_1,
		expected: true,
	},
	{
		name: "1 year > 11 months",
		matcher: { $gt: month(11) },
		duration: { length: 1, unit: "year" },
		startsAt: JAN_1,
		expected: true,
	},
	{
		name: "1 year ≥ 12 months",
		matcher: { $gte: month(12) },
		duration: { length: 1, unit: "year" },
		startsAt: JAN_1,
		expected: true,
	},
	{
		name: "14 days within [7 days, 1 month)",
		matcher: { $gte: day(7), $lt: month(1) },
		duration: day(14),
		startsAt: JAN_1,
		expected: true,
	},
	{
		name: "5 days within [7 days, 1 month)",
		matcher: { $gte: day(7), $lt: month(1) },
		duration: day(5),
		startsAt: JAN_1,
		expected: false,
	},
	// date-fns truncates fractional years to whole months, so this is the trial billing creates.
	{
		name: "0.1 year is measured as billing measures it (1 month) and is < 2 months",
		matcher: { $lt: month(2) },
		duration: { length: 0.1, unit: "year" },
		startsAt: JAN_1,
		expected: true,
	},
	{
		name: "no duration never matches",
		matcher: { $lt: month(2) },
		duration: null,
		startsAt: JAN_1,
		expected: false,
	},
];

describe("durationMatcherMatches", () => {
	test.each(CASES)("$name", ({ matcher, duration, startsAt, expected }) => {
		expect(durationMatcherMatches({ matcher, duration, startsAt })).toBe(
			expected,
		);
	});

	test("an undefined matcher matches anything, like the other matchers", () => {
		expect(
			durationMatcherMatches({
				matcher: undefined,
				duration: null,
				startsAt: JAN_1,
			}),
		).toBe(true);
	});
});
