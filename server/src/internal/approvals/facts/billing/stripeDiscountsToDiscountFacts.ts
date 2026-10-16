import {
	type StripeDiscountWithCoupon,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type { BillingChangeFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import { stripeCouponToRewardId } from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeCouponToRewardId";

/**
 * Discounts this request adds. Ones the customer already has, carried copies
 * included, are left out, so keeping an old coupon can't fail a discount rule.
 */
export const stripeDiscountsToDiscountFacts = ({
	stripeDiscounts = [],
	currentDiscounts,
	currency,
}: {
	stripeDiscounts?: StripeDiscountWithCoupon[];
	currentDiscounts: StripeDiscountWithCoupon[];
	currency: string;
}): BillingChangeFacts["discounts"] => {
	const currentRewardIds = new Set(
		currentDiscounts.map(({ source }) => stripeCouponToRewardId(source.coupon)),
	);

	return stripeDiscounts
		.map(({ source: { coupon } }) => ({
			coupon,
			rewardId: stripeCouponToRewardId(coupon),
		}))
		.filter(({ rewardId }) => !currentRewardIds.has(rewardId))
		.map(({ coupon, rewardId }) => ({
			reward_id: rewardId,
			percent_off: coupon.percent_off ?? null,
			amount_off:
				coupon.amount_off === null
					? null
					: stripeToAtmnAmount({
							amount: coupon.amount_off,
							currency: coupon.currency ?? currency,
						}),
		}));
};
