import type { StripeDiscountWithCoupon } from "@autumn/shared";
import { stripeCouponToRewardId } from "./stripeCouponToRewardId";

/** Rewards that are no longer applied are ignored, so removal is idempotent. */
export const removeDiscountsByRewardIds = ({
	discounts,
	rewardIds,
}: {
	discounts: StripeDiscountWithCoupon[];
	rewardIds: string[];
}): StripeDiscountWithCoupon[] => {
	if (rewardIds.length === 0) return discounts;

	const removedRewardIds = new Set(rewardIds);
	return discounts.filter((discount) => {
		const { coupon } = discount.source;
		return (
			!removedRewardIds.has(coupon.id) &&
			!removedRewardIds.has(stripeCouponToRewardId(coupon))
		);
	});
};
