import type Stripe from "stripe";

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

export type StripeSubscriptionWithDiscounts = Stripe.Subscription & {
	discounts: StripeExpandedDiscount[];
};

export type StripeCustomerWithDiscount = Stripe.Customer & {
	discount: StripeCustomerExpandedDiscount | null;
};
