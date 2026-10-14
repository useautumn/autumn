import type { ShapeFallbackCandidate } from "./matchItemByShape";

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
