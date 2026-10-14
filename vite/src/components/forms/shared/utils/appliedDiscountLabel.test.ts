import { describe, expect, test } from "bun:test";
import {
	CouponDurationType,
	RewardType,
	remainingDiscountMonths,
} from "@autumn/shared";
import {
	type AppliedDiscount,
	appliedDiscountLabel,
} from "./appliedDiscountLabel";

const discount = (
	overrides: Partial<AppliedDiscount> = {},
): AppliedDiscount => ({
	id: "launch_20",
	name: "Launch",
	type: RewardType.PercentageDiscount,
	discount_value: 20,
	duration_type: CouponDurationType.Months,
	duration_value: 3,
	...overrides,
});

describe("appliedDiscountLabel", () => {
	test("shows the months the server carries, counted to cover the remaining discounted renewals", () => {
		const monthsLeft = remainingDiscountMonths({
			currentEpochMs: Date.UTC(2026, 9, 2),
			billingCycleAnchorMs: Date.UTC(2026, 8, 14),
			periodEndMs: Date.UTC(2026, 9, 14),
			renewal: { interval: "month", intervalCount: 1 },
			discountEndMs: Date.UTC(2026, 11, 17),
		});

		expect(monthsLeft).toBe(3);
		expect(
			appliedDiscountLabel({ discount: discount({ months_left: monthsLeft }) }),
		).toBe("Launch (20% off) · 3 months left");
	});

	test("reads one month and ends this period", () => {
		expect(
			appliedDiscountLabel({ discount: discount({ months_left: 1 }) }),
		).toBe("Launch (20% off) · 1 month left");
		expect(
			appliedDiscountLabel({ discount: discount({ months_left: 0 }) }),
		).toBe("Launch (20% off) · ends this period");
	});

	test("adds nothing without a carried count, as for attach and update subscription", () => {
		expect(appliedDiscountLabel({ discount: discount() })).toBe(
			"Launch (20% off)",
		);
		expect(
			appliedDiscountLabel({
				discount: discount({
					duration_type: CouponDurationType.Forever,
					months_left: null,
				}),
			}),
		).toBe("Launch (20% off)");
	});
});
