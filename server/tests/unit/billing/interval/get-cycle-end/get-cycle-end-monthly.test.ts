import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleEnd } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

describe("get-cycle-end-monthly: monthly intervals, anchor in the past", () => {
	describe("Monthly anchor in the past", () => {
		test("anchor: 2 Jan, now: 15 Feb -> end of cycle should be 2 Mar", () => {
			const anchor = toUnix({ year: 2025, month: 1, day: 2 });
			const now = toUnix({ year: 2025, month: 2, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { month, day, hour } = fromUnix(result);
			expect(month).toBe(3);
			expect(day).toBe(2);
			expect(hour).toBe(12);
		});

		test("anchor: 18 Jan, now: 15 Feb -> end of cycle should be 18 Feb", () => {
			const anchor = toUnix({ year: 2025, month: 1, day: 18 });
			const now = toUnix({ year: 2025, month: 2, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { month, day, hour } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(18);
			expect(hour).toBe(12);
		});

		test("(intervalCount = 3) anchor: 2 Jan, now: 15 Feb -> end of cycle should be 2 Apr", () => {
			const anchor = toUnix({ year: 2025, month: 1, day: 2 });
			const now = toUnix({ year: 2025, month: 2, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 3,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(2);
		});

		test("(intervalCount = 3) anchor: 18 Jan, now: 15 Feb -> end of cycle should be 18 Apr", () => {
			const anchor = toUnix({ year: 2025, month: 1, day: 18 });
			const now = toUnix({ year: 2025, month: 2, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 3,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(18);
		});
	});

	describe("Monthly anchor in the past, edge cases", () => {
		test("anchor: 28 Feb, now: 15 Mar -> end of cycle should be 28 Mar", () => {
			const anchor = toUnix({ year: 2025, month: 2, day: 28 });
			const now = toUnix({ year: 2025, month: 3, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { month, day, hour } = fromUnix(result);
			expect(month).toBe(3);
			expect(day).toBe(28);
			expect(hour).toBe(12);
		});

		test("anchor: 31 Mar, now: 15 Apr -> end of cycle should be 30 Apr", () => {
			const anchor = toUnix({ year: 2025, month: 3, day: 31 });
			const now = toUnix({ year: 2025, month: 4, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { month, day, hour } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(30);
			expect(hour).toBe(12);
		});

		test("anchor: 31 Mar, now: 2 May -> end of cycle should be 31 May", () => {
			const anchor = toUnix({ year: 2025, month: 3, day: 31 });
			const now = toUnix({ year: 2025, month: 5, day: 2 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { month, day, hour } = fromUnix(result);
			expect(month).toBe(5);
			expect(day).toBe(31);
			expect(hour).toBe(12);
		});

		test("(intervalCount = 2) anchor: 31 Mar, now: 15 Apr -> end of cycle should be 31 May", () => {
			const anchor = toUnix({ year: 2025, month: 3, day: 31 });
			const now = toUnix({ year: 2025, month: 4, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 2,
				now,
			});

			const { month, day, hour } = fromUnix(result);
			expect(month).toBe(5);
			expect(day).toBe(31);
			expect(hour).toBe(12);
		});

		test("anchor: 31 Mar 12:00, now: 30 Apr 11:59 -> end of cycle should be 30 Apr 12:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 3,
				day: 31,
				hour: 12,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 4,
				day: 30,
				hour: 11,
				minute: 59,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { month, day, hour, minute } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(30);
			expect(hour).toBe(12);
			expect(minute).toBe(0);
		});

		test("anchor: 31 Mar 12:00, now: 30 Apr 12:01 -> end of cycle should be 31 May 12:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 3,
				day: 31,
				hour: 12,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 4,
				day: 30,
				hour: 12,
				minute: 1,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { month, day, hour, minute } = fromUnix(result);
			expect(month).toBe(5);
			expect(day).toBe(31);
			expect(hour).toBe(12);
			expect(minute).toBe(0);
		});
	});

	describe("Monthly anchors, anchor in the future", () => {
		test("anchor: 28 Apr, now: 15 Jan -> end of cycle should be 28 Jan", () => {
			const anchor = toUnix({ year: 2025, month: 4, day: 28 });
			const now = toUnix({ year: 2025, month: 1, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { year, month, day, hour } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(1);
			expect(day).toBe(28);
			expect(hour).toBe(12);
		});

		test("(intervalCount = 3) anchor: 28 Apr, now: 15 Jan -> end of cycle should be 28 Jan", () => {
			const anchor = toUnix({ year: 2025, month: 4, day: 28 });
			const now = toUnix({ year: 2025, month: 1, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 3,
				now,
			});

			const { year, month, day, hour } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(1);
			expect(day).toBe(28);
			expect(hour).toBe(12);
		});

		test("(intervalCount = 2) anchor: 31 May, now: 15 Feb -> end of cycle should be 31 Mar", () => {
			const anchor = toUnix({ year: 2025, month: 5, day: 31 });
			const now = toUnix({ year: 2025, month: 2, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 2,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(3);
			expect(day).toBe(31);
		});
	});

	describe("Monthly anchors, anchor in the future, edge cases", () => {
		test("anchor: 31 May, now: 15 Mar -> end should be 30 Apr (end-of-month capping)", () => {
			const anchor = toUnix({ year: 2025, month: 5, day: 31 });
			const now = toUnix({ year: 2025, month: 3, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(3);
			expect(day).toBe(31);
		});

		test("anchor: 30 Apr, now: 15 Feb -> end should be 28 Feb (capped)", () => {
			const anchor = toUnix({ year: 2025, month: 4, day: 30 });
			const now = toUnix({ year: 2025, month: 2, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(28);
		});

		test("anchor: 28 Apr 12:00, now: 28 Jan 11:59 -> end should be 28 Jan 12:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 4,
				day: 28,
				hour: 12,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 28,
				hour: 11,
				minute: 59,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { year, month, day, hour } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(1);
			expect(day).toBe(28);
			expect(hour).toBe(12);
		});

		test("anchor: 28 Apr 12:00, now: 28 Jan 12:01 -> end should be 28 Feb 12:00", () => {
			const anchor = toUnix({
				year: 2025,
				month: 4,
				day: 28,
				hour: 12,
				minute: 0,
			});
			const now = toUnix({
				year: 2025,
				month: 1,
				day: 28,
				hour: 12,
				minute: 1,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { year, month, day, hour } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(2);
			expect(day).toBe(28);
			expect(hour).toBe(12);
		});

		test("(intervalCount = 2) anchor: 31 Jul, now: 15 Feb -> end should be 31 Mar", () => {
			const anchor = toUnix({ year: 2025, month: 7, day: 31 });
			const now = toUnix({ year: 2025, month: 2, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 2,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(3);
			expect(day).toBe(31);
		});
	});
});
