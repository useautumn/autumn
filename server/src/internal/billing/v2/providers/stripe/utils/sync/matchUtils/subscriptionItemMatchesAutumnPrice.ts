import type { Price, Product } from "@autumn/shared";
import type Stripe from "stripe";
import { normalizeStripeSubscriptionItem } from "../normalizeStripeObject.js";
import { stripePriceIdMatchesAutumnPrice } from "./stripePriceIdMatchesAutumnPrice.js";
import { stripeProductIdMatchesAutumnPrice } from "./stripeProductIdMatchesAutumnPrice.js";

export const subscriptionItemMatchesAutumnPrice = ({
	stripeSubscriptionItem,
	price,
	product,
}: {
	stripeSubscriptionItem: Stripe.SubscriptionItem;
	price: Price;
	product: Product;
}): boolean => {
	const candidate = normalizeStripeSubscriptionItem({
		stripeItem: stripeSubscriptionItem,
	});

	// When the Stripe item has a price ID, match strictly on price ID — falling
	// back to product-ID would wrongly conflate sibling prices under the same
	// product (e.g. monthly vs yearly variants of the same product).
	if (candidate.stripePriceId) {
		return stripePriceIdMatchesAutumnPrice({ candidate, price });
	}

	// Only fall back to product-ID matching when no Stripe price ID is present
	// (legacy / unexpanded items).
	return stripeProductIdMatchesAutumnPrice({ candidate, price, product });
};
