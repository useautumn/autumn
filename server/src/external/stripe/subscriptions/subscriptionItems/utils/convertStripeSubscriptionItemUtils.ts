import type Stripe from "stripe";
import { stripePriceToAmount } from "@/external/stripe/prices/utils/convertStripePriceUtils";

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

/**
 * What a subscription item bills this cycle, in the currency's smallest unit.
 * Null when the item's price is tiered but its `tiers` were not expanded.
 */
export const stripeSubscriptionItemToAmount = ({
	stripeSubscriptionItem,
}: {
	stripeSubscriptionItem: Stripe.SubscriptionItem;
}): number | null =>
	stripePriceToAmount({
		stripePrice: stripeSubscriptionItem.price,
		quantity: stripeSubscriptionItem.quantity ?? 0,
	});
