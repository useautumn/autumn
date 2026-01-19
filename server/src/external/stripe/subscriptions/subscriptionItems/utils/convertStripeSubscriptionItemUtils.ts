import type Stripe from "stripe";

/**
 * Converts a Stripe subscription item to a Stripe price ID.
 * @param stripeSubscriptionItem - The Stripe subscription item to convert.
 * @returns The Stripe price ID.
 */
export const stripeSubscriptionItemToStripePriceId = (
	stripeSubscriptionItem: Stripe.SubscriptionItem,
) => {
	const price = stripeSubscriptionItem.price;

	if (typeof price === "string") {
		return price;
	}

	return price.id;
};
