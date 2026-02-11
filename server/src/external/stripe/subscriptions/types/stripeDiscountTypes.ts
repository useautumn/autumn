import type Stripe from "stripe";

/**
 * Stripe discount with expanded coupon (including applies_to).
 * Used for subscription-level discounts where coupon is under source.coupon.
 */
export type StripeExpandedDiscount = Omit<Stripe.Discount, "source"> & {
	source: {
		coupon: Stripe.Coupon & {
			applies_to: Stripe.Coupon.AppliesTo | null;
		};
	};
};

/**
 * Customer discount structure when expanded via "discount.source.coupon.applies_to".
 *
 * Uses the `source.coupon` structure introduced in Stripe API version 2025-09-30.clover.
 *
 * @see https://docs.stripe.com/changelog/clover/2025-09-30/add-discount-source-property
 */
export type StripeCustomerExpandedDiscount = Omit<Stripe.Discount, "source"> & {
	source: {
		coupon: Stripe.Coupon & {
			applies_to: Stripe.Coupon.AppliesTo | null;
		};
		type: "coupon";
	};
};

/**
 * Stripe subscription with discounts expanded.
 * Compatible type for extractStripeDiscounts / fetchStripeDiscountsForBilling.
 */
export type StripeSubscriptionWithDiscounts = Stripe.Subscription & {
	discounts: StripeExpandedDiscount[];
};

/**
 * Stripe customer with discount expanded.
 * Compatible type for extractStripeDiscounts / fetchStripeDiscountsForBilling.
 */
export type StripeCustomerWithDiscount = Stripe.Customer & {
	discount: StripeCustomerExpandedDiscount | null;
};
