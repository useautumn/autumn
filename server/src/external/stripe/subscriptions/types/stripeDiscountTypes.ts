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
 * Customer discount structure when expanded via "discount.coupon.applies_to".
 *
 * TODO: Investigate if this is the correct expand path or if it should be
 * "discount.source.coupon.applies_to" to match the actual Stripe API structure.
 */
export type StripeCustomerExpandedDiscount = Omit<Stripe.Discount, "coupon"> & {
	coupon: Stripe.Coupon & {
		applies_to: Stripe.Coupon.AppliesTo | null;
	};
};

/**
 * Stripe subscription with discounts expanded.
 * Compatible type for setupStripeDiscountsForBilling.
 */
export type StripeSubscriptionWithDiscounts = Stripe.Subscription & {
	discounts: StripeExpandedDiscount[];
};

/**
 * Stripe customer with discount expanded.
 * Compatible type for setupStripeDiscountsForBilling.
 */
export type StripeCustomerWithDiscount = Stripe.Customer & {
	discount: StripeCustomerExpandedDiscount | null;
};
