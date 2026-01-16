import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleEnd } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

describe("get-cycle-end: annual intervals", () => {
	describe("anchor in the past", () => {
		// Basic
		test("anchor: Jan 15 2024, now: Jun 20 2024 -> Jan 15 2025", () => {
			const anchor = toUnix({ year: 2024, month: 1, day: 15 });
			const now = toUnix({ year: 2024, month: 6, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(1);
			expect(day).toBe(15);
		});

		// intervalCount > 1
		test("(intervalCount = 2) anchor: Jan 15 2022, now: Jun 20 2024 -> Jan 15 2026", () => {
			const anchor = toUnix({ year: 2022, month: 1, day: 15 });
			const now = toUnix({ year: 2024, month: 6, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 2,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2026);
			expect(month).toBe(1);
			expect(day).toBe(15);
		});

		// Edge cases
		test("leap year Feb 29: anchor: Feb 29 2024, now: Jun 20 2024 -> Feb 28 2025", () => {
			const anchor = toUnix({ year: 2024, month: 2, day: 29 });
			const now = toUnix({ year: 2024, month: 6, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(2);
			expect(day).toBe(28); // 2025 is not a leap year
		});

		test("leap year to leap year: anchor: Feb 29 2024, now: Jun 20 2027 -> Feb 29 2028", () => {
			const anchor = toUnix({ year: 2024, month: 2, day: 29 });
			const now = toUnix({ year: 2027, month: 6, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2028);
			expect(month).toBe(2);
			expect(day).toBe(29); // 2028 is a leap year
		});

		test("end of month Jan 31: anchor: Jan 31 2024, now: Jun 20 2024 -> Jan 31 2025", () => {
			const anchor = toUnix({ year: 2024, month: 1, day: 31 });
			const now = toUnix({ year: 2024, month: 6, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(1);
			expect(day).toBe(31); // Jan always has 31 days
		});

		test("end of month Apr 30: anchor: Apr 30 2024, now: Jun 20 2024 -> Apr 30 2025", () => {
			const anchor = toUnix({ year: 2024, month: 4, day: 30 });
			const now = toUnix({ year: 2024, month: 6, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(4);
			expect(day).toBe(30); // Apr always has 30 days
		});
	});

	describe("anchor in the future", () => {
		// Basic
		test("anchor: Dec 15 2025, now: Jun 20 2025 -> Dec 15 2025", () => {
			const anchor = toUnix({ year: 2025, month: 12, day: 15 });
			const now = toUnix({ year: 2025, month: 6, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(12);
			expect(day).toBe(15);
		});

		// intervalCount > 1
		test("(intervalCount = 2) anchor: Dec 15 2026, now: Jun 20 2025 -> Dec 15 2026", () => {
			const anchor = toUnix({ year: 2026, month: 12, day: 15 });
			const now = toUnix({ year: 2025, month: 6, day: 20 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 2,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2026);
			expect(month).toBe(12);
			expect(day).toBe(15);
		});

		// Edge cases
		test("just before anchor: anchor: Jul 1 2025, now: Jun 30 2025 -> Jul 1 2025", () => {
			const anchor = toUnix({ year: 2025, month: 7, day: 1 });
			const now = toUnix({ year: 2025, month: 6, day: 30 });
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Year,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(7);
			expect(day).toBe(1);
		});
	});
});
