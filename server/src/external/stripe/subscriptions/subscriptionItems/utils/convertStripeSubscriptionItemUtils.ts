import type Stripe from "stripe";

export const stripeSubscriptionItemToStripePriceId = (
	stripeSubscriptionItem: Stripe.SubscriptionItem,
) => {
	const price = stripeSubscriptionItem.price;

	if (typeof price === "string") {
		return price;
	}

	return price.id;
};
