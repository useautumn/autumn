import { expect, test } from "bun:test";
import {
	hasCompleteUtcMonth,
	shouldUseMonthlyRollup,
} from "@/internal/analytics/actions/dailyRollupRouting.js";

test("monthly rollups: detect a complete UTC month inside the window", () => {
	expect(
		hasCompleteUtcMonth({
			startDate: "2026-01-15 12:00:00",
			endDate: "2026-03-10 09:00:00",
		}),
	).toBe(true);

	expect(
		hasCompleteUtcMonth({
			startDate: "2026-01-01 00:00:00",
			endDate: "2026-03-01T00:00:00",
		}),
	).toBe(true);

	expect(
		hasCompleteUtcMonth({
			startDate: "2028-02-01 00:00:00",
			endDate: "2028-03-01 00:00:00",
		}),
	).toBe(true);

	expect(
		hasCompleteUtcMonth({
			startDate: "2025-11-20 00:00:00",
			endDate: "2026-01-05 00:00:00",
		}),
	).toBe(true);
});

test("monthly rollups: a window with no complete UTC month has nothing to read", () => {
	expect(
		hasCompleteUtcMonth({
			startDate: "2026-01-15 12:00:00",
			endDate: "2026-01-28 12:00:00",
		}),
	).toBe(false);

	expect(
		hasCompleteUtcMonth({
			startDate: "2026-01-15 00:00:00",
			endDate: "2026-02-10 00:00:00",
		}),
	).toBe(false);

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
