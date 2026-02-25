import { describe, expect, test } from "bun:test";
import {
	CouponDurationType,
	type Reward,
	type RewardProgram,
	RewardType,
} from "@autumn/shared";
import type Stripe from "stripe";
import {
	buildDiscountOptions,
	filterDiscountRewards,
	formatCouponDiscount,
	rewardToOption,
	stripeCouponToOption,
} from "@/components/forms/attach-v2/utils/discountOptionUtils";

function makeReward(overrides: Partial<Reward> & { id: string }): Reward {
	return {
		name: null,
		promo_codes: [],
		type: RewardType.PercentageDiscount,
		free_product_id: null,
		discount_config: null,
		free_product_config: null,
		internal_id: `rew_${overrides.id}`,
		org_id: "org_test",
		env: "sandbox",
		created_at: Date.now(),
		...overrides,
	};
}

function makeStripeCoupon(
	overrides: Partial<Stripe.Coupon> & { id: string },
): Stripe.Coupon {
	return {
		object: "coupon",
		created: Math.floor(Date.now() / 1000),
		livemode: false,
		metadata: {},
		name: null,
		percent_off: null,
		amount_off: null,
		currency: null,
		duration: "once",
		duration_in_months: null,
		valid: true,
		max_redemptions: null,
		redeem_by: null,
		times_redeemed: 0,
		...overrides,
	} as Stripe.Coupon;
}

function makeRewardProgram(
	overrides: Partial<RewardProgram> & {
		internal_reward_id: string;
		product_ids: string[];
	},
): RewardProgram {
	return {
		internal_id: `rp_${overrides.internal_reward_id}`,
		org_id: "org_test",
		env: "sandbox",
		created_at: Date.now(),
		...overrides,
	} as RewardProgram;
}

describe("filterDiscountRewards", () => {
	test("should keep percentage and fixed discount rewards", () => {
		const rewards = [
			makeReward({ id: "pct", type: RewardType.PercentageDiscount }),
			makeReward({ id: "fix", type: RewardType.FixedDiscount }),
		];
		const result = filterDiscountRewards(rewards);
		expect(result).toHaveLength(2);
	});

	test("should filter out free product and invoice credits rewards", () => {
		const rewards = [
			makeReward({ id: "pct", type: RewardType.PercentageDiscount }),
			makeReward({ id: "free", type: RewardType.FreeProduct }),
			makeReward({ id: "credits", type: RewardType.InvoiceCredits }),
		];
		const result = filterDiscountRewards(rewards);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("pct");
	});

	test("should return empty array when no discount rewards exist", () => {
		const rewards = [makeReward({ id: "free", type: RewardType.FreeProduct })];
		expect(filterDiscountRewards(rewards)).toHaveLength(0);
	});
});

describe("rewardToOption", () => {
	test("should use reward name as label", () => {
		const reward = makeReward({ id: "r1", name: "20% Off" });
		const option = rewardToOption(reward);
		expect(option).toEqual({
			id: "r1",
			label: "20% Off",
			sublabel: undefined,
			source: "autumn",
		});
	});

	test("should fall back to id when name is null", () => {
		const reward = makeReward({ id: "r1", name: null });
		expect(rewardToOption(reward).label).toBe("r1");
	});

	test("should include first promo code as sublabel", () => {
		const reward = makeReward({
			id: "r1",
			name: "Discount",
			promo_codes: [{ code: "SAVE20" }, { code: "SAVE30" }],
		});
		expect(rewardToOption(reward).sublabel).toBe("SAVE20");
	});
});

describe("formatCouponDiscount", () => {
	test("should format percent_off", () => {
		const coupon = makeStripeCoupon({ id: "c1", percent_off: 25 });
		expect(formatCouponDiscount(coupon)).toBe("25% off");
	});

	test("should format amount_off in cents to currency display", () => {
		const coupon = makeStripeCoupon({
			id: "c1",
			amount_off: 1000,
			currency: "usd",
		});
		expect(formatCouponDiscount(coupon)).toBe("10 USD off");
	});

	test("should default to USD when no currency", () => {
		const coupon = makeStripeCoupon({ id: "c1", amount_off: 500 });
		expect(formatCouponDiscount(coupon)).toBe("5 USD off");
	});

	test("should return empty string when no discount values set", () => {
		const coupon = makeStripeCoupon({ id: "c1" });
		expect(formatCouponDiscount(coupon)).toBe("");
	});
});

describe("stripeCouponToOption", () => {
	test("should use coupon name as label", () => {
		const coupon = makeStripeCoupon({
			id: "c1",
			name: "Holiday Sale",
			percent_off: 15,
		});
		const option = stripeCouponToOption(coupon);
		expect(option).toEqual({
			id: "c1",
			label: "Holiday Sale",
			sublabel: "15% off",
			source: "stripe",
		});
	});

	test("should fall back to id when name is null", () => {
		const coupon = makeStripeCoupon({ id: "c1", name: null });
		expect(stripeCouponToOption(coupon).label).toBe("c1");
	});
});

describe("buildDiscountOptions", () => {
	test("should return autumn rewards mapped to options", () => {
		const rewards = [
			makeReward({
				id: "r1",
				name: "10% Off",
				type: RewardType.PercentageDiscount,
				discount_config: {
					discount_value: 10,
					duration_type: CouponDurationType.OneOff,
					duration_value: 0,
					apply_to_all: true,
				},
			}),
		];
		const result = buildDiscountOptions({
			rewards,
			rewardPrograms: [],
			stripeCoupons: [],
			productId: undefined,
		});
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			id: "r1",
			label: "10% Off",
			sublabel: undefined,
			source: "autumn",
		});
	});

	test("should return stripe-only coupons mapped to options", () => {
		const stripeCoupons = [
			makeStripeCoupon({ id: "sc1", name: "Stripe Deal", percent_off: 20 }),
		];
		const result = buildDiscountOptions({
			rewards: [],
			rewardPrograms: [],
			stripeCoupons,
			productId: undefined,
		});
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			id: "sc1",
			label: "Stripe Deal",
			sublabel: "20% off",
			source: "stripe",
		});
	});

	test("should deduplicate stripe coupons that match autumn reward IDs", () => {
		const rewards = [
			makeReward({
				id: "shared_id",
				name: "Autumn Discount",
				type: RewardType.PercentageDiscount,
				discount_config: {
					discount_value: 10,
					duration_type: CouponDurationType.OneOff,
					duration_value: 0,
					apply_to_all: true,
				},
			}),
		];
		const stripeCoupons = [
			makeStripeCoupon({
				id: "shared_id",
				name: "Same Coupon In Stripe",
				percent_off: 10,
			}),
			makeStripeCoupon({
				id: "stripe_only",
				name: "Stripe Only",
				percent_off: 30,
			}),
		];
		const result = buildDiscountOptions({
			rewards,
			rewardPrograms: [],
			stripeCoupons,
			productId: undefined,
		});
		expect(result).toHaveLength(2);
		// First should be the Autumn reward version
		expect(result[0].id).toBe("shared_id");
		expect(result[0].source).toBe("autumn");
		// Second should be the stripe-only coupon
		expect(result[1].id).toBe("stripe_only");
		expect(result[1].source).toBe("stripe");
	});

	test("should deduplicate against all autumn rewards, not just discount-type ones", () => {
		// A free product reward that shares an ID with a Stripe coupon should still deduplicate
		const rewards = [
			makeReward({
				id: "free_reward_id",
				type: RewardType.FreeProduct,
			}),
		];
		const stripeCoupons = [
			makeStripeCoupon({
				id: "free_reward_id",
				name: "Coupon",
				percent_off: 5,
			}),
		];
		const result = buildDiscountOptions({
			rewards,
			rewardPrograms: [],
			stripeCoupons,
			productId: undefined,
		});
		// Free product reward is filtered from autumn options, AND
		// the stripe coupon with the same ID is deduped away
		expect(result).toHaveLength(0);
	});

	test("should filter non-discount reward types from autumn options", () => {
		const rewards = [
			makeReward({
				id: "discount",
				type: RewardType.PercentageDiscount,
				discount_config: {
					discount_value: 10,
					duration_type: CouponDurationType.OneOff,
					duration_value: 0,
					apply_to_all: true,
				},
			}),
			makeReward({ id: "free", type: RewardType.FreeProduct }),
			makeReward({ id: "credits", type: RewardType.InvoiceCredits }),
		];
		const result = buildDiscountOptions({
			rewards,
			rewardPrograms: [],
			stripeCoupons: [],
			productId: undefined,
		});
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("discount");
	});

	test("should filter autumn rewards by product when productId is provided", () => {
		const rewards = [
			makeReward({
				id: "all_products",
				name: "All Products",
				type: RewardType.PercentageDiscount,
				discount_config: {
					discount_value: 10,
					duration_type: CouponDurationType.OneOff,
					duration_value: 0,
					apply_to_all: true,
				},
			}),
			makeReward({
				id: "specific",
				name: "Specific",
				type: RewardType.FixedDiscount,
				discount_config: {
					discount_value: 500,
					duration_type: CouponDurationType.OneOff,
					duration_value: 0,
					apply_to_all: false,
				},
			}),
		];
		const rewardPrograms = [
			makeRewardProgram({
				internal_reward_id: "rew_specific",
				product_ids: ["prod_other"],
			}),
		];
		const result = buildDiscountOptions({
			rewards,
			rewardPrograms,
			stripeCoupons: [],
			productId: "prod_target",
		});
		// Only the apply_to_all reward should pass; the specific one is linked to prod_other
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("all_products");
	});

	test("should place autumn options before stripe options", () => {
		const rewards = [
			makeReward({
				id: "autumn1",
				name: "A",
				type: RewardType.PercentageDiscount,
				discount_config: {
					discount_value: 10,
					duration_type: CouponDurationType.OneOff,
					duration_value: 0,
					apply_to_all: true,
				},
			}),
		];
		const stripeCoupons = [
			makeStripeCoupon({ id: "stripe1", name: "B", percent_off: 5 }),
		];
		const result = buildDiscountOptions({
			rewards,
			rewardPrograms: [],
			stripeCoupons,
			productId: undefined,
		});
		expect(result[0].source).toBe("autumn");
		expect(result[1].source).toBe("stripe");
	});

	test("should return empty array when no rewards or coupons", () => {
		const result = buildDiscountOptions({
			rewards: [],
			rewardPrograms: [],
			stripeCoupons: [],
			productId: undefined,
		});
		expect(result).toHaveLength(0);
	});
});
