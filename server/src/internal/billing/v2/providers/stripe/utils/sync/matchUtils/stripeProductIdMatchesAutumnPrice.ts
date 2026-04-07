import {
	type FixedPriceConfig,
	isFixedPrice,
	type Price,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { NormalizedStripeSyncCandidate } from "../normalizeStripeObject";

const getStripeProductIdForAutumnPrice = ({
	price,
	product,
}: {
	price: Price;
	product: Product;
}): string | null => {
	if (isFixedPrice(price)) return product.processor?.id ?? null;

	const config = price.config as FixedPriceConfig | UsagePriceConfig;
	return config.stripe_product_id ?? null;
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

	return (
		getStripeProductIdForAutumnPrice({
			price,
			product,
		}) === candidate.stripeProductId
	);
};
