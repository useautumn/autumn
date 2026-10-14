import type Stripe from "stripe";
import { stripePriceToAmount } from "@/external/stripe/prices/utils/convertStripePriceUtils";

export const stripeSubscriptionItemToStripePriceId = (
	stripeSubscriptionItem: Stripe.SubscriptionItem,
) => {
	const price = stripeSubscriptionItem.price;

	if (typeof price === "string") {
		return price;
	}

	return price.id;
};

export const stripeSubscriptionItemToAmount = ({
	stripeSubscriptionItem,
}: {
	stripeSubscriptionItem: Stripe.SubscriptionItem;
}): number | null =>
	stripePriceToAmount({
		stripePrice: stripeSubscriptionItem.price,
		quantity: stripeSubscriptionItem.quantity ?? 0,
	});
