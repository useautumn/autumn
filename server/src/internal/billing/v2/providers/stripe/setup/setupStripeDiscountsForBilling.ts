import type { StripeDiscountWithCoupon } from "@autumn/shared";
import type Stripe from "stripe";
import { subToDiscounts } from "../utils/discounts/subToDiscounts";

/**
 * Extracts discounts from already-fetched Stripe subscription or customer.
 * Subscription discounts take priority over customer discounts.
 */
export const setupStripeDiscountsForBilling = ({
	stripeSubscription,
	stripeCustomer,
}: {
	stripeSubscription?: Stripe.Subscription;
	stripeCustomer: Stripe.Customer;
}): StripeDiscountWithCoupon[] => {
	const subscriptionDiscounts = subToDiscounts({ sub: stripeSubscription });

	if (subscriptionDiscounts.length > 0) {
		return subscriptionDiscounts;
	}

	const customerDiscount = stripeCustomer.discount;
	if (!customerDiscount) return [];

	const coupon = customerDiscount.source?.coupon;
	if (!coupon || typeof coupon === "string") return [];

	// Normalize to StripeDiscountWithCoupon format
	return [{
		...customerDiscount,
		source: { coupon },
	} as StripeDiscountWithCoupon];
};
