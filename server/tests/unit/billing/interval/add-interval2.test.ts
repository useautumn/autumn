import { describe, expect, test } from "bun:test";
import { addInterval, BillingInterval } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

describe("add-interval2: adding interval for edge cases", () => {
	describe("End-of-month: Jan 31 anchor (the classic edge case)", () => {
		test("Jan 31 + 1 month = Feb 28/29 (NOT Mar 3!)", () => {
			// 2024 is a leap year
			const from = toUnix({ year: 2024, month: 1, day: 31 });
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
				intervalCount: 1,
			});
			const { month, day } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(29); // Feb 29 (leap year)
		});

		test("Jan 31 + 1 month = Feb 28 (non-leap year)", () => {
			const from = toUnix({ year: 2023, month: 1, day: 31 });
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
				intervalCount: 1,
			});
			const { month, day } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(28); // Feb 28
		});
	});

	describe("End-of-month: Feb 28 anchor", () => {
		test("Feb 28 + 1 month = Mar 28 (non-leap year)", () => {
			const from = toUnix({ year: 2023, month: 2, day: 28 }); // Feb 28, 2023 (non-leap)
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
				intervalCount: 1,
			});
			const { month, day } = fromUnix(result);
			expect(month).toBe(3);
			expect(day).toBe(28); // Mar 28
		});

		test("Feb 28 + 1 month = Mar 28 (leap year)", () => {
			const from = toUnix({ year: 2024, month: 2, day: 28 }); // Feb 28, 2024 (leap year)
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
				intervalCount: 1,
			});
			const { month, day } = fromUnix(result);
			expect(month).toBe(3);
			expect(day).toBe(28); // Mar 28
		});

		test("Feb 29 (leap year) + 1 month = Mar 29", () => {
			const from = toUnix({ year: 2024, month: 2, day: 29 }); // Feb 29, 2024
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
				intervalCount: 1,
			});
			const { month, day } = fromUnix(result);
			expect(month).toBe(3);
			expect(day).toBe(29); // Mar 29
		});

		test("Feb 29 + 1 year = Feb 28 (next year is non-leap)", () => {
			const from = toUnix({ year: 2024, month: 2, day: 29 }); // Feb 29, 2024
			const result = addInterval({
				from,
				interval: BillingInterval.Year,
				intervalCount: 1,
			});
			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(2);
			expect(day).toBe(28); // Feb 28, 2025 (no Feb 29)
		});
	});

	describe("End-of-month: Mar 31 anchor", () => {
		test("Mar 31 + 1 month = Apr 30 (April only has 30 days)", () => {
			const from = toUnix({ year: 2024, month: 3, day: 31 }); // Mar 31
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
				intervalCount: 1,
			});
			const { month, day } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(30); // Apr 30 (not May 1!)
		});

		test("Mar 31 + 2 months = May 31", () => {
			const from = toUnix({ year: 2024, month: 3, day: 31 });
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
				intervalCount: 2,
			});
			const { month, day } = fromUnix(result);
			expect(month).toBe(5);
			expect(day).toBe(31); // May 31
		});

		test("Mar 31 + 1 quarter = Jun 30", () => {
			const from = toUnix({ year: 2024, month: 3, day: 31 });
			const result = addInterval({
				from,
				interval: BillingInterval.Quarter,
				intervalCount: 1,
			});
			const { month, day } = fromUnix(result);
			expect(month).toBe(6);
			expect(day).toBe(30); // Jun 30
		});
	});

	describe("Time preservation", () => {
		test("preserves hour, minute, second", () => {
			const from = toUnix({
				year: 2024,
				month: 1,
				day: 15,
				hour: 14,
				minute: 30,
				second: 45,
			}); // 2:30:45 PM
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
				intervalCount: 1,
			});
			const { hour, minute, second } = fromUnix(result);
			expect(hour).toBe(14);
			expect(minute).toBe(30);
			expect(second).toBe(45);
		});

		test("preserves time even on end-of-month edge case", () => {
			const from = toUnix({
				year: 2024,
				month: 1,
				day: 31,
				hour: 23,
				minute: 59,
				second: 59,
			}); // Jan 31 at 11:59:59 PM
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
				intervalCount: 1,
			});
			const { month, day, hour, minute, second } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(29); // Feb 29, 2024
			expect(hour).toBe(23);
			expect(minute).toBe(59);
			expect(second).toBe(59);
		});
	});

	describe("Default intervalCount", () => {
		test("defaults to 1 if not provided", () => {
			const from = toUnix({ year: 2024, month: 1, day: 15 });
			const result = addInterval({
				from,
				interval: BillingInterval.Month,
			});
			const { month } = fromUnix(result);
			expect(month).toBe(2);
		});
	});
});
