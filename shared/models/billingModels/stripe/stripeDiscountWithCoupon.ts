import type Stripe from "stripe";

/**
 * A discount source with a guaranteed expanded Stripe Coupon object.
 * When the discount originates from a promotion code, promotionCodeId
 * is included for proper attribution in checkout sessions.
 *
 * Note: `id` is only present for existing discounts from a subscription.
 * When resolving coupons/promo codes for new subscriptions, `id` is undefined.
 *
 * `end` is the Unix timestamp (seconds) when the discount expires.
 * Null means the discount has no expiry (e.g. forever/once coupons).
 */
export type StripeDiscountWithCoupon = {
	id?: string;
	end?: number | null;
	source: { coupon: Stripe.Coupon };
	promotionCodeId?: string;
};
