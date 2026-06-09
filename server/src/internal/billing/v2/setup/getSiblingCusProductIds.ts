import { cp, type FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";

export const getSiblingCusProductIds = ({
	fullCustomer,
	stripeSubscription,
	excludeIds = [],
}: {
	fullCustomer: FullCustomer;
	stripeSubscription?: Stripe.Subscription;
	excludeIds?: string[];
}): string[] => {
	if (!stripeSubscription) return [];

	const excluded = new Set(excludeIds);

	return fullCustomer.customer_products
		.filter(
			(cusProduct) =>
				!excluded.has(cusProduct.id) &&
				cp(cusProduct).paid().recurring().onStripeSubscription({
					stripeSubscriptionId: stripeSubscription.id,
				}).valid,
		)
		.map((cusProduct) => cusProduct.id);
};
