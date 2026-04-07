import type { Product } from "@autumn/shared";
import type { NormalizedStripeSyncCandidate } from "../normalizeStripeObject";

export const stripeProductIdMatchesAutumnProduct = ({
	candidate,
	product,
}: {
	candidate: NormalizedStripeSyncCandidate;
	product: Product;
}): boolean => {
	if (!candidate.stripeProductId) return false;

	return product.processor?.id === candidate.stripeProductId;
};
