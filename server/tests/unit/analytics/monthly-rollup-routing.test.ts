/**
 * Contract: UTC month bins read the monthly rollups only for the complete calendar months inside
 * the window, so a window without one stays entirely on the finer-grained path.
 */
import { expect, test } from "bun:test";
import {
	hasCompleteUtcMonth,
	shouldUseMonthlyRollup,
} from "@/internal/analytics/actions/dailyRollupRouting.js";

test("monthly rollups: detect a complete UTC month inside the window", () => {
	// Tanvir's Jan 15 -> Mar 10 case: February is whole, January and March are edges.
	expect(
		hasCompleteUtcMonth({
			startDate: "2026-01-15 12:00:00",
			endDate: "2026-03-10 09:00:00",
		}),
	).toBe(true);

	// Exact month boundaries on both ends: January and February are both whole.
	expect(
		hasCompleteUtcMonth({
			startDate: "2026-01-01 00:00:00",
			endDate: "2026-03-01T00:00:00",
		}),
	).toBe(true);

	// Leap February is whole.
	expect(
		hasCompleteUtcMonth({
			startDate: "2028-02-01 00:00:00",
			endDate: "2028-03-01 00:00:00",
		}),
	).toBe(true);

	// December is whole across the year rollover.
	expect(
		hasCompleteUtcMonth({
			startDate: "2025-11-20 00:00:00",
			endDate: "2026-01-05 00:00:00",
		}),
	).toBe(true);
});

test("monthly rollups: a window with no complete UTC month has nothing to read", () => {
	// One partial month.
	expect(
		hasCompleteUtcMonth({
			startDate: "2026-01-15 12:00:00",
			endDate: "2026-01-28 12:00:00",
		}),
	).toBe(false);

	// Two partial months, no whole one between them.
	expect(
		hasCompleteUtcMonth({
			startDate: "2026-01-15 00:00:00",
			endDate: "2026-02-10 00:00:00",
		}),
	).toBe(false);

	// A whole calendar month that never reaches the next month start.
	expect(
		hasCompleteUtcMonth({
			startDate: "2026-01-01 00:00:00",
			endDate: "2026-01-31 23:59:59",
		}),
	).toBe(false);

	expect(
		hasCompleteUtcMonth({ startDate: "not-a-date", endDate: "2026-03-01" }),
	).toBe(false);
});

test("monthly rollups: route only UTC month bins with no property filters", () => {
	const base = {
		binSize: "month",
		endDate: "2026-03-10 09:00:00",
		hasPropertyFilters: false,
		startDate: "2026-01-15 12:00:00",
		timezone: "UTC",
	};

	expect(shouldUseMonthlyRollup(base)).toBe(true);

	for (const binSize of ["hour", "day", "week"]) {
		expect(shouldUseMonthlyRollup({ ...base, binSize })).toBe(false);
	}
	// A non-UTC month starts mid-UTC-day, so the monthly states never line up.
	expect(
		shouldUseMonthlyRollup({ ...base, timezone: "America/New_York" }),
	).toBe(false);
	expect(shouldUseMonthlyRollup({ ...base, hasPropertyFilters: true })).toBe(
		false,
	);
	expect(
		shouldUseMonthlyRollup({ ...base, endDate: "2026-01-28 12:00:00" }),
	).toBe(false);
});
