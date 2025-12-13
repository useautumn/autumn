import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleEnd } from "@autumn/shared";
import { DayOfWeek, fromUnix, toUnixWeekly } from "@tests/utils/testIntervalUtils/testUnixUtils";

/**
 * January 2025 calendar (Week 1 = first full Mon-Sun week):
 *   Mon Tue Wed Thu Fri Sat Sun
 *             1   2   3   4   5   <- (partial)
 *     6   7   8   9  10  11  12   <- Week 1
 *    13  14  15  16  17  18  19   <- Week 2
 *    20  21  22  23  24  25  26   <- Week 3
 *    27  28  29  30  31           <- Week 4
 */
describe("get-cycle-end: weekly intervals", () => {
	describe("anchor in the past", () => {
		// Basic
		test("anchor: Jan W1 Wed (8th), now: Jan W1 Sun (12th) -> Jan W2 Wed (15th)", () => {
			const anchor = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 1,
				day: DayOfWeek.Wed,
			});
			const now = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 1,
				day: DayOfWeek.Sun,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Week,
				intervalCount: 1,
				now,
			});

			const { month, day, dayOfWeek } = fromUnix(result);
			expect(month).toBe(1);
			expect(day).toBe(15);
			expect(dayOfWeek).toBe(DayOfWeek.Wed);
		});

		// intervalCount > 1
		test("(intervalCount = 2) anchor: Jan W1 Wed (8th), now: Jan W2 Fri (17th) -> Jan W3 Wed (22nd)", () => {
			const anchor = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 1,
				day: DayOfWeek.Wed,
			});
			const now = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 2,
				day: DayOfWeek.Fri,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Week,
				intervalCount: 2,
				now,
			});

			const { month, day, dayOfWeek } = fromUnix(result);
			expect(month).toBe(1);
			expect(day).toBe(22);
			expect(dayOfWeek).toBe(DayOfWeek.Wed);
		});

		// Edge cases
		test("crossing month: anchor: Jan W4 Tue (28th), now: Feb W1 Sun (9th) -> Feb W2 Tue (11th)", () => {
			const anchor = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 4,
				day: DayOfWeek.Tue,
			});
			const now = toUnixWeekly({
				year: 2025,
				month: 2,
				week: 1,
				day: DayOfWeek.Sun,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Week,
				intervalCount: 1,
				now,
			});

			const { month, day, dayOfWeek } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(11);
			expect(dayOfWeek).toBe(DayOfWeek.Tue);
		});

		test("crossing year: anchor: Dec W1 Sun (7th), now: Jan W1 Fri (10th) -> Jan W1 Sun (12th)", () => {
			const anchor = toUnixWeekly({
				year: 2024,
				month: 12,
				week: 1,
				day: DayOfWeek.Sun,
			});
			const now = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 1,
				day: DayOfWeek.Fri,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Week,
				intervalCount: 1,
				now,
			});

			const { year, month, day, dayOfWeek } = fromUnix(result);
			expect(year).toBe(2025);
			expect(month).toBe(1);
			expect(day).toBe(12);
			expect(dayOfWeek).toBe(DayOfWeek.Sun);
		});
	});

	describe("anchor in the future", () => {
		// Basic
		test("anchor: Jan W3 Wed (22nd), now: Jan W1 Sun (12th) -> Jan W2 Wed (15th)", () => {
			const anchor = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 3,
				day: DayOfWeek.Wed,
			});
			const now = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 1,
				day: DayOfWeek.Sun,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Week,
				intervalCount: 1,
				now,
			});

			const { month, day, dayOfWeek } = fromUnix(result);
			expect(month).toBe(1);
			expect(day).toBe(15);
			expect(dayOfWeek).toBe(DayOfWeek.Wed);
		});

		// intervalCount > 1
		test("(intervalCount = 2) anchor: Jan W3 Mon (20th), now: Jan W1 Sun (12th) -> Jan W3 Mon (20th)", () => {
			const anchor = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 3,
				day: DayOfWeek.Mon,
			});
			const now = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 1,
				day: DayOfWeek.Sun,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Week,
				intervalCount: 2,
				now,
			});

			const { month, day, dayOfWeek } = fromUnix(result);
			expect(month).toBe(1);
			expect(day).toBe(20);
			expect(dayOfWeek).toBe(DayOfWeek.Mon);
		});

		// Edge cases
		test("just before anchor: anchor: Jan W3 Wed (22nd), now: Jan W3 Tue (21st) -> Jan W3 Wed (22nd)", () => {
			const anchor = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 3,
				day: DayOfWeek.Wed,
			});
			const now = toUnixWeekly({
				year: 2025,
				month: 1,
				week: 3,
				day: DayOfWeek.Tue,
			});
			const result = getCycleEnd({
				anchor,
				interval: BillingInterval.Week,
				intervalCount: 1,
				now,
			});

			const { month, day, dayOfWeek } = fromUnix(result);
			expect(month).toBe(1);
			expect(day).toBe(22);
			expect(dayOfWeek).toBe(DayOfWeek.Wed);
		});
	});
});
