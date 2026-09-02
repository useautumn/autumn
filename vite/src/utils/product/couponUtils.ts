import type Stripe from "stripe";

/** A Stripe coupon, with the promotion codes customers type to redeem it */
export type StripeCouponWithPromoCodes = Stripe.Coupon & {
	promotion_codes?: string[];
};

export const getOriginalCouponId = (couponId: string) => {
	const index = couponId.indexOf("_roll_");
	if (index !== -1) {
		return couponId.substring(0, index);
	}
	return couponId;
};
