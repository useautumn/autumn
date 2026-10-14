import type {
	Reward,
	RewardProgram,
	StripeCouponWithPromoCodes,
} from "@autumn/shared";
import {
	filterRewardsByProduct,
	RewardType,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { formatAmountWithCurrencyPrecision } from "@/utils/formatUtils/formatCurrencyUtils";

export type DiscountOption = {
	id: string;
	label: string;
	sublabel?: string;
	source: "autumn" | "stripe";
	searchTerms: string[];
};

export const discountOptionMatchesSearch = ({
	option,
	search,
}: {
	option: DiscountOption;
	search: string;
}): boolean => {
	const searchLower = search.trim().toLowerCase();
	if (!searchLower) return true;
	return [option.label, option.id, ...option.searchTerms].some((term) =>
		term.toLowerCase().includes(searchLower),
	);
};

export const filterDiscountRewards = (rewards: Reward[]): Reward[] => {
	return rewards.filter(
		(r) =>
			r.type === RewardType.PercentageDiscount ||
			r.type === RewardType.FixedDiscount,
	);
};

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

export const formatCouponDiscount = (coupon: Stripe.Coupon): string => {
	if (coupon.percent_off) return `${coupon.percent_off}% off`;
	if (!coupon.amount_off) return "";

	const currency = coupon.currency ?? undefined;
	const amount = formatAmountWithCurrencyPrecision({
		amount: stripeToAtmnAmount({ amount: coupon.amount_off, currency }),
		currency,
	});

	return `${amount} off`;
};

export const stripeCouponToOption = (
	coupon: StripeCouponWithPromoCodes,
): DiscountOption => ({
	id: coupon.id,
	label: coupon.name || coupon.id,
	sublabel: formatCouponDiscount(coupon),
	source: "stripe",
	searchTerms: coupon.promotion_codes,
});

export const stripeCouponAppliesToProduct = ({
	coupon,
	productId,
}: {
	coupon: Stripe.Coupon;
	productId: string | undefined;
}): boolean => {
	if (!productId) return true;
	const productIds = coupon.applies_to?.products;
	return !productIds?.length || productIds.includes(productId);
};

const filterStripeCouponsByProduct = ({
	stripeCoupons,
	productId,
}: {
	stripeCoupons: StripeCouponWithPromoCodes[];
	productId: string | undefined;
}) =>
	stripeCoupons.filter((coupon) =>
		stripeCouponAppliesToProduct({ coupon, productId }),
	);

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
