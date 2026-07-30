import type { ShapeFallbackCandidate } from "./matchItemByShape";

/**
 * Unclaimed items that identify as the SAME expected stored price — by
 * `autumn_customer_price_id` metadata or by the price's own Stripe id. One
 * expected item consolidates every cusProduct sharing a Stripe price, so its
 * quantity can legitimately be billed across several identified items.
 */
export const findIdentitySiblingIndexes = ({
	expectedPriceId,
	identityCusPriceIds,
	candidates,
}: {
	expectedPriceId?: string;
	identityCusPriceIds: Set<string>;
	candidates: ShapeFallbackCandidate[];
}): number[] =>
	candidates
		.filter(
			(candidate) =>
				(candidate.autumnCustomerPriceId != null &&
					identityCusPriceIds.has(candidate.autumnCustomerPriceId)) ||
				(expectedPriceId != null && candidate.priceId === expectedPriceId),
		)
		.map((candidate) => candidate.index);
