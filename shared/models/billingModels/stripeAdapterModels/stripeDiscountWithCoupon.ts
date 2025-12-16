import type Stripe from "stripe";

export type StripeDiscountWithCoupon = Stripe.Discount & {
	source: { coupon: Stripe.Coupon };
};
