import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleEnd } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

describe("get-cycle-end: quarterly intervals", () => {
	describe("anchor in the past", () => {
		// Basic
		test("anchor: Jan 15, now: Feb 20 -> Apr 15", () => {
			const anchor = toUnix({ year: 2025, month: 1, day: 15 });
			const now = toUnix({ year: 2025, month: 2, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Quarter,
				intervalCount: 1,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(15);
		});

		// intervalCount > 1
		test("(intervalCount = 2) anchor: Jan 15, now: May 20 -> Jul 15", () => {
			const anchor = toUnix({ year: 2025, month: 1, day: 15 });
			const now = toUnix({ year: 2025, month: 5, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Quarter,
				intervalCount: 2,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(7);
			expect(day).toBe(15);
		});

		// Edge cases
		test("end of month anchor (31st): anchor: Jan 31, now: Mar 15 -> Apr 30", () => {
			const anchor = toUnix({ year: 2025, month: 1, day: 31 });
			const now = toUnix({ year: 2025, month: 3, day: 15 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Quarter,
				intervalCount: 1,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(30); // Apr has 30 days
		});

		test("crossing year boundary: anchor: Nov 15, now: Dec 20 -> Feb 15", () => {
			const anchor = toUnix({ year: 2024, month: 11, day: 15 });
			const now = toUnix({ year: 2024, month: 12, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Quarter,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(2);
			expect(day).toBe(15);
		});
	});

	describe("anchor in the future", () => {
		// Basic
		test("anchor: Apr 15, now: Feb 20 -> Apr 15", () => {
			const anchor = toUnix({ year: 2025, month: 4, day: 15 });
			const now = toUnix({ year: 2025, month: 2, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Quarter,
				intervalCount: 1,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(15);
		});

		// intervalCount > 1
		test("(intervalCount = 2) anchor: Jul 15, now: Feb 20 -> Jan 15", () => {
			const anchor = toUnix({ year: 2025, month: 7, day: 15 });
			const now = toUnix({ year: 2025, month: 2, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Quarter,
				intervalCount: 2,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(7);
			expect(day).toBe(15);
		});

		// Edge cases
		test("just before anchor: anchor: Apr 15, now: Apr 14 -> Apr 15", () => {
			const anchor = toUnix({ year: 2025, month: 4, day: 15 });
			const now = toUnix({ year: 2025, month: 4, day: 14 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Quarter,
				intervalCount: 1,
				now,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(15);
		});
	});
});
