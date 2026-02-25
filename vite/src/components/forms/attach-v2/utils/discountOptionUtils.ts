import type { Reward, RewardProgram } from "@autumn/shared";
import { filterRewardsByProduct, RewardType } from "@autumn/shared";
import type Stripe from "stripe";

/** Unified type for discount options from both Autumn rewards and Stripe coupons */
export type DiscountOption = {
	id: string;
	label: string;
	sublabel?: string;
	source: "autumn" | "stripe";
};

/** Filters rewards to only show discount types (not free products) */
export const filterDiscountRewards = (rewards: Reward[]): Reward[] => {
	return rewards.filter(
		(r) =>
			r.type === RewardType.PercentageDiscount ||
			r.type === RewardType.FixedDiscount,
	);
};

/** Converts an Autumn reward to a unified discount option */
export const rewardToOption = (reward: Reward): DiscountOption => ({
	id: reward.id,
	label: reward.name || reward.id,
	sublabel: reward.promo_codes?.[0]?.code,
	source: "autumn",
});

/** Formats a Stripe coupon's discount value for display */
export const formatCouponDiscount = (coupon: Stripe.Coupon): string => {
	if (coupon.percent_off) return `${coupon.percent_off}% off`;
	if (coupon.amount_off) {
		const amount = coupon.amount_off / 100;
		const currency = (coupon.currency || "usd").toUpperCase();
		return `${amount} ${currency} off`;
	}
	return "";
};

/** Converts a Stripe coupon to a unified discount option */
export const stripeCouponToOption = (
	coupon: Stripe.Coupon,
): DiscountOption => ({
	id: coupon.id,
	label: coupon.name || coupon.id,
	sublabel: formatCouponDiscount(coupon),
	source: "stripe",
});

/** Builds a merged, deduplicated list of discount options from Autumn rewards and Stripe coupons */
export const buildDiscountOptions = ({
	rewards,
	rewardPrograms,
	stripeCoupons,
	productId,
}: {
	rewards: Reward[];
	rewardPrograms: RewardProgram[];
	stripeCoupons: Stripe.Coupon[];
	productId: string | undefined;
}): DiscountOption[] => {
	// Build Autumn reward options (filtered by type and product)
	const discountRewards = filterDiscountRewards(rewards);
	const productFilteredRewards = filterRewardsByProduct({
		rewards: discountRewards,
		rewardPrograms,
		productId,
	});
	const autumnOptions = productFilteredRewards.map(rewardToOption);

	// Build Stripe coupon options, deduplicating against ALL Autumn rewards (not just filtered ones)
	const autumnRewardIds = new Set(rewards.map((r) => r.id));
	const stripeOnlyOptions = stripeCoupons
		.filter((coupon) => !autumnRewardIds.has(coupon.id))
		.map(stripeCouponToOption);

	return [...autumnOptions, ...stripeOnlyOptions];
};
