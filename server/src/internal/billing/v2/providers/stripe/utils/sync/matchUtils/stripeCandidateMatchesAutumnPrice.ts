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

	return stripeProductIdMatchesAutumnPrice({ candidate, price, product });
};
