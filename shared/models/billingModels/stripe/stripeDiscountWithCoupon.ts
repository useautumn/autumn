import type Stripe from "stripe";

/** A discount source with a guaranteed expanded Stripe Coupon object. */
export type ResolvedStripeCoupon = {
	source: { coupon: Stripe.Coupon };
};
