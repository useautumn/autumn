import type { AttachDiscount, StripeDiscountWithCoupon } from "@autumn/shared";
import type Stripe from "stripe";
import { resolveCoupon, resolvePromotionCode } from "@/external/stripe/coupons";

export const resolveParamDiscounts = async ({
	stripeCli,
	discounts,
}: {
	stripeCli: Stripe;
	discounts: AttachDiscount[];
}): Promise<StripeDiscountWithCoupon[]> => {
	const resolved = await Promise.all(
		discounts.map((discount) => {
			if ("reward_id" in discount && discount.reward_id) {
				return resolveCoupon({ stripeCli, couponId: discount.reward_id });
			}
			return resolvePromotionCode({
				stripeCli,
				code: discount.promotion_code ?? "",
			});
		}),
	);

	const seen = new Set<string>();
	return resolved.filter((d) => {
		const couponId = d.source.coupon.id;
		if (seen.has(couponId)) return false;
		seen.add(couponId);
		return true;
	});
};
