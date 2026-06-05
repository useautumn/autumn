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

	test("aligns a day window to the anchor's time-of-day, not UTC midnight", () => {
		const anchor = Date.UTC(2026, 0, 9, 15, 30, 0); // 15:30, not midnight
		const { windowStartAt, windowEndAt } = getUsageWindowBounds({
			interval: EntInterval.Day,
			now: NOW,
			anchor,
		});
		const calendar = getUsageWindowBounds({
			interval: EntInterval.Day,
			now: NOW,
		});

		// Spans one day, contains now, and rolls at the anchor's 15:30.
		expect(windowEndAt - windowStartAt).toBe(24 * 60 * 60 * 1000);
		expect(windowStartAt).toBeLessThanOrEqual(NOW);
		expect(NOW).toBeLessThan(windowEndAt);
		expect(new Date(windowStartAt).getUTCHours()).toBe(15);
		expect(new Date(windowStartAt).getUTCMinutes()).toBe(30);
		expect(windowStartAt).not.toBe(calendar.windowStartAt);
	});

	test("aligns a month window to the anchor's day-of-month, not the 1st", () => {
		const anchor = Date.UTC(2026, 0, 9); // the 9th
		const { windowStartAt } = getUsageWindowBounds({
			interval: EntInterval.Month,
			now: NOW, // June 15
			anchor,
		});

		expect(new Date(windowStartAt).getUTCDate()).toBe(9);
		expect(windowStartAt).toBeLessThanOrEqual(NOW);
	});

	test("lifetime ignores the anchor", () => {
		expect(
			getUsageWindowBounds({
				interval: EntInterval.Lifetime,
				now: NOW,
				anchor: Date.UTC(2026, 0, 9),
			}),
		).toEqual({ windowStartAt: 0, windowEndAt: Number.MAX_SAFE_INTEGER });
	});

	// Day-31 anchor on the 30th of a 30-day month must stay cycle-aligned, not drop to
	// the UTC-calendar fallback (which would key a fresh counter mid-cycle).
	test("day-31 anchor stays cycle-aligned on the 30th of a 30-day month (no calendar fallback)", () => {
		const anchor = Date.UTC(2026, 0, 31, 8, 30, 0); // Jan 31 08:30 UTC
		const now = Date.UTC(2026, 3, 30, 9, 0, 0); // Apr 30 09:00 UTC (after the anchor time)

		const { windowStartAt, windowEndAt } = getUsageWindowBounds({
			interval: EntInterval.Month,
			now,
			anchor,
		});

		expect(windowStartAt).toBe(Date.UTC(2026, 3, 30, 8, 30, 0)); // Apr 30 08:30
		expect(windowEndAt).toBe(Date.UTC(2026, 4, 31, 8, 30, 0)); // May 31 08:30
		expect(windowStartAt).toBeLessThanOrEqual(now);
		expect(now).toBeLessThan(windowEndAt);
		expect(windowStartAt).not.toBe(Date.UTC(2026, 3, 1)); // not the calendar fallback
	});
});
