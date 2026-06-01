import { describe, expect, test } from "bun:test";
import { EntInterval, getUsageWindowBounds } from "@autumn/shared";

// 2026-06-15T12:34:56Z (a Monday; month index 5 = June)
const NOW = Date.UTC(2026, 5, 15, 12, 34, 56);

describe("getUsageWindowBounds", () => {
	test("day window floors to UTC midnight and spans one day", () => {
		expect(
			getUsageWindowBounds({ interval: EntInterval.Day, now: NOW }),
		).toEqual({
			windowStartAt: Date.UTC(2026, 5, 15),
			windowEndAt: Date.UTC(2026, 5, 16),
		});
	});

	test("week window floors to Monday 00:00 UTC and spans 7 days", () => {
		// Wednesday -> floors back to Monday June 15.
		const wednesday = Date.UTC(2026, 5, 17, 8, 0, 0);
		expect(
			getUsageWindowBounds({ interval: EntInterval.Week, now: wednesday }),
		).toEqual({
			windowStartAt: Date.UTC(2026, 5, 15),
			windowEndAt: Date.UTC(2026, 5, 22),
		});
	});

	test("month window floors to the 1st and spans one month", () => {
		expect(
			getUsageWindowBounds({ interval: EntInterval.Month, now: NOW }),
		).toEqual({
			windowStartAt: Date.UTC(2026, 5, 1),
			windowEndAt: Date.UTC(2026, 6, 1),
		});
	});

	test("quarter window floors to the start of the quarter and spans 3 months", () => {
		expect(
			getUsageWindowBounds({ interval: EntInterval.Quarter, now: NOW }),
		).toEqual({
			windowStartAt: Date.UTC(2026, 3, 1),
			windowEndAt: Date.UTC(2026, 6, 1),
		});
	});

	test("semi_annual floors to Jan 1 in the first half and spans 6 months", () => {
		const may = Date.UTC(2026, 4, 15);
		expect(
			getUsageWindowBounds({ interval: EntInterval.SemiAnnual, now: may }),
		).toEqual({
			windowStartAt: Date.UTC(2026, 0, 1),
			windowEndAt: Date.UTC(2026, 6, 1),
		});
	});

	test("semi_annual floors to Jul 1 in the second half", () => {
		const august = Date.UTC(2026, 7, 15);
		expect(
			getUsageWindowBounds({ interval: EntInterval.SemiAnnual, now: august }),
		).toEqual({
			windowStartAt: Date.UTC(2026, 6, 1),
			windowEndAt: Date.UTC(2027, 0, 1),
		});
	});

	test("year window floors to Jan 1 and spans one year", () => {
		expect(
			getUsageWindowBounds({ interval: EntInterval.Year, now: NOW }),
		).toEqual({
			windowStartAt: Date.UTC(2026, 0, 1),
			windowEndAt: Date.UTC(2027, 0, 1),
		});
	});

	test("lifetime never resets", () => {
		expect(
			getUsageWindowBounds({ interval: EntInterval.Lifetime, now: NOW }),
		).toEqual({ windowStartAt: 0, windowEndAt: Number.MAX_SAFE_INTEGER });
	});

	test("is deterministic across the same window", () => {
		expect(
			getUsageWindowBounds({ interval: EntInterval.Month, now: NOW }),
		).toEqual(
			getUsageWindowBounds({ interval: EntInterval.Month, now: NOW + 1000 }),
		);
	});
});
