import type {
	Reward,
	RewardProgram,
	StripeCouponWithPromoCodes,
} from "@autumn/shared";
import {
	filterRewardsByProduct,
	formatAmount,
	RewardType,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";

/** Unified type for discount options from both Autumn rewards and Stripe coupons */
export type DiscountOption = {
	id: string;
	label: string;
	sublabel?: string;
	source: "autumn" | "stripe";
	/** Extra strings the option can be searched by, e.g. its promo codes */
	searchTerms: string[];
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
export const rewardToOption = (reward: Reward): DiscountOption => {
	const promoCodes = (reward.promo_codes ?? [])
		.map((promoCode) => promoCode.code)
		.filter(Boolean);

	return {
		id: reward.id,
		label: reward.name || reward.id,
		sublabel: promoCodes[0],
		source: "autumn",
		searchTerms: promoCodes,
	};
};

/** Formats a Stripe coupon's discount value for display, e.g. "$1,500.00 off" */
export const formatCouponDiscount = (coupon: Stripe.Coupon): string => {
	if (coupon.percent_off) return `${coupon.percent_off}% off`;
	if (!coupon.amount_off) return "";

	const currency = coupon.currency ?? undefined;
	const amount = formatAmount({
		amount: stripeToAtmnAmount({ amount: coupon.amount_off, currency }),
		currency,
		// Leave the fraction digits to Intl so each currency keeps its own
		// precision: $1,500.00, but ¥1,850.
		amountFormatOptions: {
			minimumFractionDigits: undefined,
			maximumFractionDigits: undefined,
		},
	});

	return `${amount} off`;
};

/** Converts a Stripe coupon to a unified discount option */
export const stripeCouponToOption = (
	coupon: StripeCouponWithPromoCodes,
): DiscountOption => ({
	id: coupon.id,
	label: coupon.name || coupon.id,
	sublabel: formatCouponDiscount(coupon),
	source: "stripe",
	searchTerms: coupon.promotion_codes,
});

const filterStripeCouponsByProduct = ({
	stripeCoupons,
	productId,
}: {
	stripeCoupons: StripeCouponWithPromoCodes[];
	productId: string | undefined;
}) => {
	if (!productId) return stripeCoupons;

	return stripeCoupons.filter((coupon) => {
		const productIds = coupon.applies_to?.products;
		return !productIds?.length || productIds.includes(productId);
	});
};

/** Builds a merged, deduplicated list of discount options from Autumn rewards and Stripe coupons */
export const buildDiscountOptions = ({
	rewards,
	rewardPrograms,
	stripeCoupons,
	productId,
}: {
	rewards: Reward[];
	rewardPrograms: RewardProgram[];
	stripeCoupons: StripeCouponWithPromoCodes[];
	productId: string | undefined;
}): DiscountOption[] => {
	const autumnOptions = filterRewardsByProduct({
		rewards: filterDiscountRewards(rewards),
		rewardPrograms,
		productId,
	}).map(rewardToOption);

	const autumnOptionIds = new Set(autumnOptions.map((option) => option.id));
	const stripeOnlyOptions = filterStripeCouponsByProduct({
		stripeCoupons,
		productId,
	})
		.filter((coupon) => !autumnOptionIds.has(coupon.id))
		.map(stripeCouponToOption);

	return [...autumnOptions, ...stripeOnlyOptions];
};
