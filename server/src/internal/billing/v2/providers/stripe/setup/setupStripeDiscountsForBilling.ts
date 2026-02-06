import type { ResolvedStripeCoupon } from "@autumn/shared";
import type {
	StripeCustomerWithDiscount,
	StripeSubscriptionWithDiscounts,
} from "@/external/stripe/subscriptions";
import { subToDiscounts } from "../utils/discounts/subToDiscounts";

/**
 * Extracts discounts from already-fetched Stripe subscription or customer.
 * Subscription discounts take priority over customer discounts.
 *
 * Both subscription and customer discounts use the `source.coupon` structure
 * introduced in Stripe API version 2025-09-30.clover.
 *
 * @see https://docs.stripe.com/changelog/clover/2025-09-30/add-discount-source-property
 * @see https://docs.stripe.com/api/discounts/object
 */
export const setupStripeDiscountsForBilling = ({
	stripeSubscription,
	stripeCustomer,
}: {
	stripeSubscription?: StripeSubscriptionWithDiscounts;
	stripeCustomer: StripeCustomerWithDiscount;
}): ResolvedStripeCoupon[] => {
	const subscriptionDiscounts = subToDiscounts({ sub: stripeSubscription });

	if (subscriptionDiscounts.length > 0) {
		return subscriptionDiscounts;
	}

	const customerDiscount = stripeCustomer.discount;
	if (!customerDiscount) return [];

	const coupon = customerDiscount.source?.coupon;
	if (!coupon || typeof coupon === "string") return [];

	// Customer discount already has source.coupon structure, return as-is
	return [customerDiscount as ResolvedStripeCoupon];
};
