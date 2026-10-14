import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleEnd } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

describe("get-cycle-end-floor: floor parameter constrains minimum result", () => {
	describe("Monthly interval with floor - long trial scenario", () => {
		test("trial ends far in future: anchor 4 Aug, now 16 Jan, floor 4 Aug -> returns 4 Aug", () => {
			const anchor = toUnix({ year: 2026, month: 8, day: 4 });
			const now = toUnix({ year: 2026, month: 1, day: 16 });
			const floor = anchor;

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

			expect(result).toBe(floor);
			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2026);
			expect(month).toBe(12);
			expect(day).toBe(15);
		});
	});

	describe("Weekly interval with floor", () => {
		test("trial ends in 3 weeks: floor constrains result", () => {
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
			const anchor = toUnix({ year: 2026, month: 8, day: 4 });
			const now = toUnix({ year: 2026, month: 1, day: 16 });

			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2026);
			expect(month).toBe(2);
			expect(day).toBe(4);
		});
	});
});
