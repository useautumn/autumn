import type Stripe from "stripe";

/**
 * A discount source with a guaranteed expanded Stripe Coupon object.
 * When the discount originates from a promotion code, promotionCodeId
 * is included for proper attribution in checkout sessions.
 */
export type StripeDiscountWithCoupon = {
	source: { coupon: Stripe.Coupon };
	promotionCodeId?: string;
};
