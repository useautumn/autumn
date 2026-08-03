import {
	type FixedPriceConfig,
	isFixedPrice,
	type Price,
	type Product,
	productToStripeIds,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { NormalizedStripeSyncCandidate } from "../normalizeStripeObject.js";

/** A fixed price is keyed to its plan's Stripe products (primary + aliases). */
const getStripeProductIdsForAutumnPrice = ({
	price,
	product,
}: {
	price: Price;
	product: Product;
}): string[] => {
	if (isFixedPrice(price)) return productToStripeIds({ product });

	const config = price.config as FixedPriceConfig | UsagePriceConfig;
	return config.stripe_product_id ? [config.stripe_product_id] : [];
};

export const stripeProductIdMatchesAutumnPrice = ({
	candidate,
	price,
	product,
}: {
	candidate: NormalizedStripeSyncCandidate;
	price: Price;
	product: Product;
}): boolean => {
	if (!candidate.stripeProductId) return false;

	return getStripeProductIdsForAutumnPrice({ price, product }).includes(
		candidate.stripeProductId,
	);
};
