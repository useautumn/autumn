import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleEnd } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

/**
 * Test suite for getCycleEnd floor parameter
 *
 * The floor parameter sets a minimum allowed result. If the calculated cycle end
 * is before the floor, the floor is returned instead.
 *
 * Use case: Long trial periods. When the billing anchor (trial end) is far in the
 * future, getCycleEnd normally finds the next cycle boundary after `now`, which
 * "wraps backwards" from the anchor. With floor, we can ensure billing doesn't
 * start before the trial ends.
 *
 * Example: Trial ends 4 Aug (anchor), now is 16 Jan, monthly interval.
 * Without floor: returns 4 Feb (next monthly boundary after now).
 * With floor=4 Aug: returns 4 Aug (billing can't start before trial ends).
 */
describe("get-cycle-end-floor: floor parameter constrains minimum result", () => {
	describe("Monthly interval with floor - long trial scenario", () => {
		test("trial ends far in future: anchor 4 Aug, now 16 Jan, floor 4 Aug -> returns 4 Aug", () => {
			// Trial ends 4 Aug (anchor), now is 16 Jan
			// Without floor: cycle end would be 4 Feb (wraps backwards from anchor)
			// With floor: returns 4 Aug (trial end date)
			const anchor = toUnix({ year: 2026, month: 8, day: 4 });
			const now = toUnix({ year: 2026, month: 1, day: 16 });
			const floor = anchor; // Can't bill before trial ends

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				floor,
			});

			expect(result).toBe(floor);
			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2026);
			expect(month).toBe(8);
			expect(day).toBe(4);
		});

		test("200-day trial: anchor 4 Aug, now 16 Jan, floor 4 Aug -> returns anchor", () => {
			// Simulating the exact bug scenario: 200-day trial
			const anchor = toUnix({
				year: 2026,
				month: 8,
				day: 4,
				hour: 13,
				minute: 45,
			});
			const now = toUnix({
				year: 2026,
				month: 1,
				day: 16,
				hour: 13,
				minute: 45,
			});
			const floor = anchor;

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				floor,
			});

			expect(result).toBe(floor);
		});

		test("floor not triggered when cycle end is after floor", () => {
			// Anchor is 2 Jan, now is 15 Jan, floor is 1 Jan
			// Cycle end is 2 Feb, which is after floor, so floor not used
			const anchor = toUnix({ year: 2025, month: 1, day: 2 });
			const now = toUnix({ year: 2025, month: 1, day: 15 });
			const floor = toUnix({ year: 2025, month: 1, day: 1 });

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				floor,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(2);
			expect(day).toBe(2);
		});

		test("floor equals calculated end: returns that value", () => {
			// Edge case: floor is exactly the calculated cycle end
			const anchor = toUnix({ year: 2025, month: 1, day: 15 });
			const now = toUnix({ year: 2025, month: 1, day: 20 });
			const floor = toUnix({ year: 2025, month: 2, day: 15 });

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				floor,
			});

			expect(result).toBe(floor);
		});

		test("anchor in near future (< 1 interval): without floor wraps correctly, with floor constrains", () => {
			// Anchor is 28 Feb, now is 15 Jan
			// Without floor: returns 28 Jan (next boundary)
			// With floor of 28 Feb: returns 28 Feb
			const anchor = toUnix({ year: 2025, month: 2, day: 28 });
			const now = toUnix({ year: 2025, month: 1, day: 15 });
			const floor = anchor;

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				floor,
			});

			expect(result).toBe(floor);
			const { month, day } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(28);
		});
	});

	describe("Quarterly interval (intervalCount=3) with floor", () => {
		test("long trial with quarterly billing: floor constrains result", () => {
			// Trial ends 15 Jul (anchor, quarterly), now is 1 Feb
			// Without floor: cycle end would be 15 Apr
			// With floor: returns 15 Jul
			const anchor = toUnix({ year: 2025, month: 7, day: 15 });
			const now = toUnix({ year: 2025, month: 2, day: 1 });
			const floor = anchor;

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 3,
				now,
				floor,
			});

			expect(result).toBe(floor);
			const { month, day } = fromUnix(result);
			expect(month).toBe(7);
			expect(day).toBe(15);
		});
	});

	describe("Annual interval with floor", () => {
		test("long trial with annual billing: floor constrains result", () => {
			// Trial ends 15 Dec 2025 (anchor), now is 1 Mar 2025
			// Without floor: cycle end would be 15 Dec 2024 (past!)
			// Wait, that's not right. Let me recalculate...
			// Actually for annual: anchor 15 Dec 2025, now 1 Mar 2025
			// Difference is negative (-9 months), cyclesPassed = floor(-9/12) = -1
			// Next cycle end = anchor + (-1+1)*12 = 15 Dec 2025
			// So floor wouldn't be triggered here. Let's use a different scenario.

			// Anchor is 15 Dec 2026, now is 1 Mar 2025
			// This is a very long trial (21 months)
			const anchor = toUnix({ year: 2026, month: 12, day: 15 });
			const now = toUnix({ year: 2025, month: 3, day: 1 });
			const floor = anchor;

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 1,
				now,
				floor,
			});

			// Without floor: would be 15 Dec 2025
			// With floor: returns 15 Dec 2026
			expect(result).toBe(floor);
			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2026);
			expect(month).toBe(12);
			expect(day).toBe(15);
		});
	});

	describe("Weekly interval with floor", () => {
		test("trial ends in 3 weeks: floor constrains result", () => {
			// Anchor is 28 Jan (3 weeks from now), now is 7 Jan
			// Without floor: cycle end would be 14 Jan (next weekly boundary)
			// With floor: returns 28 Jan
			const anchor = toUnix({ year: 2025, month: 1, day: 28 });
			const now = toUnix({ year: 2025, month: 1, day: 7 });
			const floor = anchor;

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Week,
				intervalCount: 1,
				now,
				floor,
			});

			expect(result).toBe(floor);
			const { month, day } = fromUnix(result);
			expect(month).toBe(1);
			expect(day).toBe(28);
		});
	});

	describe("No floor (undefined) maintains original behavior", () => {
		test("without floor: returns calculated cycle end even if anchor is far future", () => {
			// Same scenario as first test but without floor
			const anchor = toUnix({ year: 2026, month: 8, day: 4 });
			const now = toUnix({ year: 2026, month: 1, day: 16 });

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				// floor not provided
			});

			// Without floor, returns 4 Feb (next monthly boundary after now)
			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2026);
			expect(month).toBe(2);
			expect(day).toBe(4);
		});
	});
});
