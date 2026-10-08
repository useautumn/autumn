import { describe, expect, test } from "bun:test";
import {
	type ApiDiscount,
	CouponDurationType,
	RewardType,
} from "@autumn/shared";
import { addDays, addMonths } from "date-fns";
import { appliedDiscountLabel } from "./appliedDiscountLabel";

const NOW_MS = new Date("2026-10-08T12:00:00Z").getTime();

const discount = (overrides: Partial<ApiDiscount> = {}): ApiDiscount => ({
	id: "launch_20",
	name: "Launch",
	type: RewardType.PercentageDiscount,
	discount_value: 20,
	duration_type: CouponDurationType.Months,
	duration_value: 3,
	...overrides,
});

describe("appliedDiscountLabel", () => {
	test("shows the months a part-used repeating coupon has left", () => {
		expect(
			appliedDiscountLabel({
				discount: discount({
					end: addDays(addMonths(NOW_MS, 1), 10).getTime(),
				}),
				nowMs: NOW_MS,
			}),
		).toBe("Launch (20% off) · 1 month left");
		expect(
			appliedDiscountLabel({
				discount: discount({ end: addMonths(NOW_MS, 2).getTime() }),
				nowMs: NOW_MS,
			}),
		).toBe("Launch (20% off) · 2 months left");
	});

	test("says a repeating coupon ends this period when no whole month is left", () => {
		expect(
			appliedDiscountLabel({
				discount: discount({ end: addDays(NOW_MS, 12).getTime() }),
				nowMs: NOW_MS,
			}),
		).toBe("Launch (20% off) · ends this period");
	});

	test("adds nothing for forever and once coupons", () => {
		for (const duration_type of [
			CouponDurationType.Forever,
			CouponDurationType.OneOff,
		]) {
			expect(
				appliedDiscountLabel({
					discount: discount({ duration_type, end: null }),
					nowMs: NOW_MS,
				}),
			).toBe("Launch (20% off)");
		}
	});
});
