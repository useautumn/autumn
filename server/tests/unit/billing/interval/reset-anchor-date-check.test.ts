import { describe, expect, test } from "bun:test";
import { EntInterval, type FullCusProduct } from "@autumn/shared";
import { toUnix, fromUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";
import { getResetAtUpdate } from "@/internal/customers/actions/resetCustomerEntitlements/getResetAtUpdate";

/**
 * Minimal cusProduct stub with no subscription_ids.
 * Exercises the shouldCheck date logic without hitting Stripe --
 * if shouldCheck passes, the function still returns unmodified because
 * there are no subscription_ids to look up.
 */
const emptyCusProduct = {
	subscription_ids: [],
} as unknown as FullCusProduct;

const dummyOrg = {} as any;
const dummyEnv = "test" as any;

// All curResetAt dates are in the future so getNextResetAt returns
// curReset + 1 interval on the first iteration (no looping).

describe("reset-anchor-date-check: getResetAtUpdate", () => {
	describe("short-duration intervals skip anchor check entirely", () => {
		test("4-hourly: curReset Mar 28 06:00 -> Mar 28 10:00", async () => {
			const curResetAt = toUnix({ year: 2027, month: 3, day: 28, hour: 6 });

			const result = await getResetAtUpdate({
				curResetAt,
				interval: EntInterval.Hour,
				intervalCount: 4,
				cusProduct: emptyCusProduct,
				org: dummyOrg,
				env: dummyEnv,
			});

			const { year, month, day, hour } = fromUnix(result);
			expect(year).toBe(2027);
			expect(month).toBe(3);
			expect(day).toBe(28);
			expect(hour).toBe(10);
		});

		test("30-minute: curReset Feb 28 10:00 -> Feb 28 10:30", async () => {
			const curResetAt = toUnix({ year: 2027, month: 2, day: 28, hour: 10, minute: 0 });

			const result = await getResetAtUpdate({
				curResetAt,
				interval: EntInterval.Minute,
				intervalCount: 30,
				cusProduct: emptyCusProduct,
				org: dummyOrg,
				env: dummyEnv,
			});

			const { month, day, hour, minute } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(28);
			expect(hour).toBe(10);
			expect(minute).toBe(30);
		});

		test("daily: curReset Apr 30 12:00 -> May 1 12:00", async () => {
			const curResetAt = toUnix({ year: 2027, month: 4, day: 30, hour: 12 });

			const result = await getResetAtUpdate({
				curResetAt,
				interval: EntInterval.Day,
				intervalCount: 1,
				cusProduct: emptyCusProduct,
				org: dummyOrg,
				env: dummyEnv,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(5);
			expect(day).toBe(1);
		});
	});

	describe("monthly interval on non-edge dates skips anchor check", () => {
		test("Mar 15 -> Apr 15", async () => {
			const curResetAt = toUnix({ year: 2027, month: 3, day: 15, hour: 12 });

			const result = await getResetAtUpdate({
				curResetAt,
				interval: EntInterval.Month,
				intervalCount: 1,
				cusProduct: emptyCusProduct,
				org: dummyOrg,
				env: dummyEnv,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(15);
		});
	});

	describe("monthly interval on edge dates enters anchor check path", () => {
		test("Jan 30 -> Feb 28 (day 28, Feb = edge date, no sub so unmodified)", async () => {
			const curResetAt = toUnix({ year: 2027, month: 1, day: 30, hour: 12 });

			const result = await getResetAtUpdate({
				curResetAt,
				interval: EntInterval.Month,
				intervalCount: 1,
				cusProduct: emptyCusProduct,
				org: dummyOrg,
				env: dummyEnv,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(28);
		});

		test("Mar 30 -> Apr 30 (day 30 = edge date, no sub so unmodified)", async () => {
			const curResetAt = toUnix({ year: 2027, month: 3, day: 30, hour: 12 });

			const result = await getResetAtUpdate({
				curResetAt,
				interval: EntInterval.Month,
				intervalCount: 1,
				cusProduct: emptyCusProduct,
				org: dummyOrg,
				env: dummyEnv,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(4);
			expect(day).toBe(30);
		});
	});

	describe("Mar 28 must NOT trigger anchor check (the original bug)", () => {
		test("Feb 28 -> Mar 28: day 28 in March is NOT an edge date", async () => {
			const curResetAt = toUnix({ year: 2027, month: 2, day: 28, hour: 12 });

			const result = await getResetAtUpdate({
				curResetAt,
				interval: EntInterval.Month,
				intervalCount: 1,
				cusProduct: emptyCusProduct,
				org: dummyOrg,
				env: dummyEnv,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(3);
			expect(day).toBe(28);
		});
	});

	describe("no cusProduct skips anchor check entirely", () => {
		test("null cusProduct on Jan 30 -> Feb 28 (unmodified)", async () => {
			const curResetAt = toUnix({ year: 2027, month: 1, day: 30, hour: 12 });

			const result = await getResetAtUpdate({
				curResetAt,
				interval: EntInterval.Month,
				intervalCount: 1,
				cusProduct: null,
				org: dummyOrg,
				env: dummyEnv,
			});

			const { month, day } = fromUnix(result);
			expect(month).toBe(2);
			expect(day).toBe(28);
		});
	});
});
