import type Stripe from "stripe";

export type StripeCouponWithPromoCodes = Stripe.Coupon & {
	promotion_codes: string[];
};
