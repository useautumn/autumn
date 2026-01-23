import type { StripeDiscountWithCoupon } from "@autumn/shared";
import type {
	StripeCustomerWithDiscount,
	StripeSubscriptionWithDiscounts,
} from "@/external/stripe/subscriptions";
import { subToDiscounts } from "../utils/discounts/subToDiscounts";

/**
 * Extracts discounts from already-fetched Stripe subscription or customer.
 * Subscription discounts take priority over customer discounts.
 *
 * TODO: Investigate if customer discount expand path should be
 * "discount.source.coupon.applies_to" instead of "discount.coupon.applies_to"
 */
export const setupStripeDiscountsForBilling = ({
	stripeSubscription,
	stripeCustomer,
}: {
	stripeSubscription?: StripeSubscriptionWithDiscounts;
	stripeCustomer: StripeCustomerWithDiscount;
}): StripeDiscountWithCoupon[] => {
	const subscriptionDiscounts = subToDiscounts({ sub: stripeSubscription });

	if (subscriptionDiscounts.length > 0) {
		return subscriptionDiscounts;
	}

	const customerDiscount = stripeCustomer.discount;
	if (!customerDiscount) return [];

	const coupon = customerDiscount.coupon;
	if (!coupon || typeof coupon === "string") return [];

	// Normalize to StripeDiscountWithCoupon format
	return [
		{
			...customerDiscount,
			source: { coupon },
		} as StripeDiscountWithCoupon,
	];
};
