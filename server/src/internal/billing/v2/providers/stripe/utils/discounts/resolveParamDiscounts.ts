import type { AttachDiscount, StripeDiscountWithCoupon } from "@autumn/shared";
import type Stripe from "stripe";
import { resolveCoupon, resolvePromotionCode } from "@/external/stripe/coupons";

/**
 * Resolves `discounts` param entries into validated Stripe coupon objects.
 * Accepts coupon IDs (passed directly) and human-readable promo code strings (resolved via Stripe API).
 */
export const resolveParamDiscounts = async ({
	stripeCli,
	discounts,
}: {
	stripeCli: Stripe;
	discounts: AttachDiscount[];
}): Promise<StripeDiscountWithCoupon[]> => {
	const resolved = await Promise.all(
		discounts.map((discount) => {
			if ("reward_id" in discount) {
				return resolveCoupon({ stripeCli, couponId: discount.reward_id });
			}
			return resolvePromotionCode({
				stripeCli,
				code: discount.promotion_code,
			});
		}),
	);

	// Deduplicate by coupon ID
	const seen = new Set<string>();
	return resolved.filter((d) => {
		const couponId = d.source.coupon.id;
		if (seen.has(couponId)) return false;
		seen.add(couponId);
		return true;
	});
};
