import { describe, expect, test } from "bun:test";
import { BillingInterval, getCycleStart } from "@autumn/shared";
import { fromUnix, toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";

describe("get-cycle-start-floor: floor parameter constrains minimum result", () => {
	describe("Monthly interval with floor", () => {
		test("subscription starts mid-cycle: anchor 15 Jan, now 5 Jan, floor 1 Jan -> returns 1 Jan", () => {
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
			const anchor = toUnix({ year: 2025, month: 1, day: 15 });
			const now = toUnix({ year: 2025, month: 1, day: 5 });

			const result = getCycleStart({
				anchor,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now,
			});

			const { year, month, day } = fromUnix(result);
			expect(year).toBe(2024);
			expect(month).toBe(12);
			expect(day).toBe(15);
		});
	});
});
