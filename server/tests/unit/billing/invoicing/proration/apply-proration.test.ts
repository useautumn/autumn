import { describe, expect, test } from "bun:test";
import { applyProration } from "@autumn/shared";

const ONE_DAY = 86_400_000;
const THIRTY_DAYS = 30 * ONE_DAY;

describe("applyProration", () => {
	describe("normal proration", () => {
		test("returns full amount when now equals period start", () => {
			const result = applyProration({
				now: 1000,
				billingPeriod: { start: 1000, end: 1000 + THIRTY_DAYS },
				amount: 3000,
			});
			expect(result).toBe(3000);
		});

		test("returns zero when now equals period end", () => {
			const result = applyProration({
				now: 1000 + THIRTY_DAYS,
				billingPeriod: { start: 1000, end: 1000 + THIRTY_DAYS },
				amount: 3000,
			});
			expect(result).toBe(0);
		});

		test("returns half when now is at midpoint", () => {
			const start = 1000;
			const end = start + THIRTY_DAYS;
			const mid = start + THIRTY_DAYS / 2;

			const result = applyProration({
				now: mid,
				billingPeriod: { start, end },
				amount: 3000,
			});
			expect(result).toBe(1500);
		});
	});

	describe("zero-length billing period", () => {
		test("returns 0 when start equals end (not NaN)", () => {
			const result = applyProration({
				now: 1000,
				billingPeriod: { start: 1000, end: 1000 },
				amount: 3000,
			});
			expect(result).toBe(0);
			expect(Number.isNaN(result)).toBe(false);
		});

		test("returns 0 when start equals end with zero amount", () => {
			const result = applyProration({
				now: 1000,
				billingPeriod: { start: 1000, end: 1000 },
				amount: 0,
			});
			expect(result).toBe(0);
			expect(Number.isNaN(result)).toBe(false);
		});

		test("returns 0 when start equals end and now differs", () => {
			const result = applyProration({
				now: 5000,
				billingPeriod: { start: 1000, end: 1000 },
				amount: 3000,
			});
			expect(result).toBe(0);
			expect(Number.isNaN(result)).toBe(false);
		});
	});
});
