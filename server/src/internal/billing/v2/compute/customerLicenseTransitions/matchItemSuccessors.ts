import {
	type CustomerLicenseTransition,
	type FullProductWithoutLicenses,
	findEntitlementSuccessor,
	findPriceSuccessor,
} from "@autumn/shared";

type ItemSuccessorMatches = Pick<
	CustomerLicenseTransition,
	"priceTransitions" | "entitlementTransitions"
>;

/**
 * Matches the outgoing definition's ITEMS to their successors. An item is a
 * price, an entitlement, or a paid-feature pair of both — the price and
 * entitlement finders share their key's feature + interval components, so a
 * paired item's two halves match the same successor item independently.
 * Strict 1:1: ambiguous keys transition nothing.
 */
export const matchItemSuccessors = ({
	fromProduct,
	toProduct,
}: {
	fromProduct: FullProductWithoutLicenses;
	toProduct: FullProductWithoutLicenses;
}): ItemSuccessorMatches => {
	const priceTransitions: ItemSuccessorMatches["priceTransitions"] = [];
	const claimedPriceIds = new Set<string>();

	for (const sourcePrice of fromProduct.prices) {
		const successor = findPriceSuccessor({
			sourcePrice,
			candidatePrices: toProduct.prices,
			excludedPriceIds: claimedPriceIds,
		});
		if (!successor || successor.id === sourcePrice.id) continue;

		claimedPriceIds.add(successor.id);
		priceTransitions.push({
			fromPriceId: sourcePrice.id,
			toPriceId: successor.id,
		});
	}

	const entitlementTransitions: ItemSuccessorMatches["entitlementTransitions"] =
		[];
	const claimedEntitlementIds = new Set<string>();

	for (const sourceEntitlement of fromProduct.entitlements) {
		const successor = findEntitlementSuccessor({
			sourceEntitlement,
			candidateEntitlements: toProduct.entitlements,
			excludedEntitlementIds: claimedEntitlementIds,
		});
		if (!successor || successor.id === sourceEntitlement.id) continue;

		claimedEntitlementIds.add(successor.id);
		entitlementTransitions.push({
			fromEntitlementId: sourceEntitlement.id,
			toEntitlementId: successor.id,
		});
	}

	return { priceTransitions, entitlementTransitions };
};
