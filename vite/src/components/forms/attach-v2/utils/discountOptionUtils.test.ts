import { describe, expect, test } from "bun:test";
import type { Reward } from "@autumn/shared";
import { RewardType } from "@autumn/shared";
import type { StripeCouponWithPromoCodes } from "@/utils/product/couponUtils";
import {
	formatCouponDiscount,
	rewardToOption,
	stripeCouponToOption,
} from "./discountOptionUtils";

const buildStripeCoupon = (
	overrides: Partial<StripeCouponWithPromoCodes>,
): StripeCouponWithPromoCodes =>
	({
		id: "coupon_1",
		object: "coupon",
		currency: "usd",
		livemode: false,
		valid: true,
		...overrides,
	}) as StripeCouponWithPromoCodes;

const buildReward = (overrides: Partial<Reward>): Reward =>
	({
		id: "reward_1",
		name: "Reward 1",
		type: RewardType.PercentageDiscount,
		promo_codes: [],
		...overrides,
	}) as Reward;

describe("formatCouponDiscount", () => {
	test("formats fixed amounts as localised currency", () => {
		expect(
			formatCouponDiscount(
				buildStripeCoupon({ amount_off: 150_000, currency: "usd" }),
			),
		).toBe("$1,500.00 off");
	});

	test("formats percentages", () => {
		expect(formatCouponDiscount(buildStripeCoupon({ percent_off: 20 }))).toBe(
			"20% off",
		);
	});

	test("returns an empty string when the coupon has no discount", () => {
		expect(formatCouponDiscount(buildStripeCoupon({}))).toBe("");
	});
});

describe("search terms", () => {
	test("a reward is searchable by all of its promo codes", () => {
		const option = rewardToOption(
			buildReward({
				promo_codes: [{ code: "SUMMER20" }, { code: "WINTER20" }],
			}),
		);

		expect(option.searchTerms).toEqual(["SUMMER20", "WINTER20"]);
		expect(option.sublabel).toBe("SUMMER20");
	});

	test("a Stripe coupon is searchable by its promotion codes", () => {
		const option = stripeCouponToOption(
			buildStripeCoupon({ promotion_codes: ["RESEND50"], percent_off: 50 }),
		);

		expect(option.searchTerms).toEqual(["RESEND50"]);
		expect(option.sublabel).toBe("50% off");
	});

	test("a Stripe coupon with no promotion codes has no search terms", () => {
		expect(stripeCouponToOption(buildStripeCoupon({})).searchTerms).toEqual([]);
	});
});
