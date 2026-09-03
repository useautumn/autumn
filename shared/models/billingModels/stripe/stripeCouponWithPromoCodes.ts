import type Stripe from "stripe";

/**
 * A Stripe coupon together with the promotion codes attached to it.
 *
 * A coupon's id is often opaque (Stripe generates one when a coupon is created
 * in the dashboard), so the promotion codes are the strings people recognise
 * and paste when looking a coupon up.
 */
export type StripeCouponWithPromoCodes = Stripe.Coupon & {
	promotion_codes: string[];
};
