import {
	isFixedPrice,
	type Price,
	type Product,
	productToStripeIds,
} from "@autumn/shared";
import type Stripe from "stripe";
import { normalizeStripeSubscriptionItem } from "../normalizeStripeObject.js";
import { stripePriceIdMatchesAutumnPrice } from "./stripePriceIdMatchesAutumnPrice.js";
import { stripePriceMatchesFixedPrice } from "./stripePriceMatchesAutumnPrice.js";
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
	// back to a primary product ID would conflate sibling plan variants.
	if (candidate.stripePriceId) {
		if (stripePriceIdMatchesAutumnPrice({ candidate, price })) return true;
		if (!isFixedPrice(price) || !candidate.stripeProductId) return false;
		const additionalProductIds = productToStripeIds({ product }).slice(1);
		if (!additionalProductIds.includes(candidate.stripeProductId)) return false;
		return stripePriceMatchesFixedPrice({
			stripePrice: stripeSubscriptionItem.price,
			price,
			stripeProductId: candidate.stripeProductId,
			currency: stripeSubscriptionItem.price.currency,
		});
	}

	// Only fall back to product-ID matching when no Stripe price ID is present
	// (legacy / unexpanded items).
	return stripeProductIdMatchesAutumnPrice({ candidate, price, product });
};
