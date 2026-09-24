import {
	isFixedPrice,
	type Price,
	type Product,
	productToStripeIds,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { NormalizedStripeSyncCandidate } from "../normalizeStripeObject.js";
import { stripePriceIdMatchesAutumnPrice } from "./stripePriceIdMatchesAutumnPrice.js";
import { stripePriceMatchesFixedPrice } from "./stripePriceMatchesAutumnPrice.js";
import { stripeProductIdMatchesAutumnPrice } from "./stripeProductIdMatchesAutumnPrice.js";

/**
 * When the Stripe item has a price ID, match strictly on it — a shared product
 * would conflate sibling variants and differently priced items. The one
 * exception is a fixed price billed on a legacy product at the same amount.
 */
export const stripeCandidateMatchesAutumnPrice = ({
	candidate,
	stripePrice,
	price,
	product,
}: {
	candidate: NormalizedStripeSyncCandidate;
	stripePrice: Stripe.Price | undefined;
	price: Price;
	product: Product;
}): boolean => {
	if (candidate.stripePriceId) {
		if (stripePriceIdMatchesAutumnPrice({ candidate, price })) return true;
		if (!isFixedPrice(price) || !candidate.stripeProductId || !stripePrice)
			return false;
		const additionalProductIds = productToStripeIds({ product }).slice(1);
		if (!additionalProductIds.includes(candidate.stripeProductId)) return false;
		return stripePriceMatchesFixedPrice({
			stripePrice,
			price,
			stripeProductId: candidate.stripeProductId,
			currency: stripePrice.currency,
		});
	}

	// Only fall back to product-ID matching when no Stripe price ID is present
	// (legacy / unexpanded items).
	return stripeProductIdMatchesAutumnPrice({ candidate, price, product });
};
