import type Stripe from "stripe";

/**
 * A discount source with a guaranteed expanded Stripe Coupon object.
 * When the discount originates from a promotion code, promotionCodeId
 * is included for proper attribution in checkout sessions.
 *
 * Note: `id` is only present for existing discounts from a subscription.
 * When resolving coupons/promo codes for new subscriptions, `id` is undefined.
 */
export type StripeDiscountWithCoupon = {
	id?: string;
	source: { coupon: Stripe.Coupon };
	promotionCodeId?: string;
};
