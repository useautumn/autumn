import { type Product, productToStripeIds } from "@autumn/shared";
import type { NormalizedStripeSyncCandidate } from "../normalizeStripeObject.js";

export const stripeProductIdMatchesAutumnProduct = ({
	candidate,
	product,
}: {
	candidate: NormalizedStripeSyncCandidate;
	product: Product;
}): boolean => {
	if (!candidate.stripeProductId) return false;

	return productToStripeIds({ product }).includes(candidate.stripeProductId);
};
