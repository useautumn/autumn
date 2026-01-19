import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleStart } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

/**
 * Test suite for getCycleStart floor parameter
 *
 * The floor parameter sets a minimum allowed result. If the calculated cycle start
 * is before the floor, the floor is returned instead.
 *
 * Use case: Subscription starts mid-cycle. Without floor, getCycleStart would return
 * a date before the subscription existed.
 *
 * Example: Subscription starts 1 Jan, billing anchor is 15 Jan, now is 5 Jan.
 * Without floor: returns 15 Dec (previous cycle boundary).
 * With floor=1 Jan: returns 1 Jan (subscription start).
 */
describe("get-cycle-start-floor: floor parameter constrains minimum result", () => {
	describe("Monthly interval with floor", () => {
		test("subscription starts mid-cycle: anchor 15 Jan, now 5 Jan, floor 1 Jan -> returns 1 Jan", () => {
			// Subscription created 1 Jan, anchor is 15 Jan, now is 5 Jan
			// Without floor: cycle start would be 15 Dec (before subscription existed!)
			// With floor: returns 1 Jan (subscription start)
			const anchor = toUnix({ year: 2025, month: 1, day: 15 });
			const now = toUnix({ year: 2025, month: 1, day: 5 });
			const floor = toUnix({ year: 2025, month: 1, day: 1 });

			const result = getCycleStart({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				floor,
			});

			expect(result).toBe(floor);
			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(1);
			expect(day).toBe(1);
		});

		test("floor not triggered when cycle start is after floor", () => {
			// Anchor is 2 Jan, now is 15 Feb, floor is 1 Jan
			// Cycle start is 2 Feb, which is after floor, so floor not used
			const anchor = toUnix({ year: 2025, month: 1, day: 2 });
			const now = toUnix({ year: 2025, month: 2, day: 15 });
			const floor = toUnix({ year: 2025, month: 1, day: 1 });

			const result = getCycleStart({
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

		test("floor equals calculated start: returns that value", () => {
			// Edge case: floor is exactly the calculated cycle start
			const anchor = toUnix({ year: 2025, month: 1, day: 15 });
			const now = toUnix({ year: 2025, month: 2, day: 20 });
			const floor = toUnix({ year: 2025, month: 2, day: 15 });

			const result = getCycleStart({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				floor,
			});

			expect(result).toBe(floor);
		});

		test("anchor far in future with floor: returns floor when cycle start would be before subscription", () => {
			// Anchor is 15 Aug (7 months in future), now is 10 Jan
			// Without floor: cycle start would be 15 Dec (previous year)
			// With floor of 1 Jan: returns 1 Jan
			const anchor = toUnix({ year: 2025, month: 8, day: 15 });
			const now = toUnix({ year: 2025, month: 1, day: 10 });
			const floor = toUnix({ year: 2025, month: 1, day: 1 });

			const result = getCycleStart({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				floor,
			});

			expect(result).toBe(floor);
		});
	});

	describe("Quarterly interval (intervalCount=3) with floor", () => {
		test("subscription starts mid-quarter: floor constrains result", () => {
			// Anchor is 15 Apr (quarterly), now is 20 Feb, subscription started 1 Feb
			// Without floor: cycle start would be 15 Jan
			// With floor: returns 1 Feb
			const anchor = toUnix({ year: 2025, month: 4, day: 15 });
			const now = toUnix({ year: 2025, month: 2, day: 20 });
			const floor = toUnix({ year: 2025, month: 2, day: 1 });

			const result = getCycleStart({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 3,
				now,
				floor,
			});

			expect(result).toBe(floor);
		});
	});

	describe("Annual interval with floor", () => {
		test("subscription starts mid-year: floor constrains result", () => {
			// Anchor is 15 Dec 2025, now is 1 Mar 2025, subscription started 1 Feb 2025
			// Without floor: cycle start would be 15 Dec 2024
			// With floor: returns 1 Feb 2025
			const anchor = toUnix({ year: 2025, month: 12, day: 15 });
			const now = toUnix({ year: 2025, month: 3, day: 1 });
			const floor = toUnix({ year: 2025, month: 2, day: 1 });

			const result = getCycleStart({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 1,
				now,
				floor,
			});

			expect(result).toBe(floor);
		});
	});

	describe("No floor (undefined) maintains original behavior", () => {
		test("without floor: returns calculated cycle start even if in the past", () => {
			// Same scenario as first test but without floor
			const anchor = toUnix({ year: 2025, month: 1, day: 15 });
			const now = toUnix({ year: 2025, month: 1, day: 5 });

			const result = getCycleStart({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
				// floor not provided
			});

			// Without floor, returns 15 Dec (previous cycle boundary)
			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2024);
			expect(month).toBe(12);
			expect(day).toBe(15);
		});
	});
});
