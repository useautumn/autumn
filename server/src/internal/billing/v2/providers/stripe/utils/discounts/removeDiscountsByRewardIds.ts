import type { StripeDiscountWithCoupon } from "@autumn/shared";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils";

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
		const couponId = discount.source.coupon.id;
		const rewardId = getOriginalCouponId(couponId) ?? couponId;
		return !removedRewardIds.has(couponId) && !removedRewardIds.has(rewardId);
	});
};
