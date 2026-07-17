import {
	BillingType,
	type CustomerLicenseTransition,
	type FullProductWithoutLicenses,
	findEntitlementSuccessor,
	findPriceSuccessor,
	getBillingType,
} from "@autumn/shared";

type ItemSuccessorMatches = Pick<
	CustomerLicenseTransition,
	"priceTransitions" | "entitlementTransitions"
>;

const findCrossIntervalFixedPriceSuccessor = ({
	sourcePrice,
	candidatePrices,
	excludedPriceIds,
}: {
	sourcePrice: FullProductWithoutLicenses["prices"][number];
	candidatePrices: FullProductWithoutLicenses["prices"];
	excludedPriceIds: Set<string>;
}) => {
	if (getBillingType(sourcePrice.config) !== BillingType.FixedCycle) {
		return undefined;
	}

	const matches = candidatePrices.filter(
		(candidatePrice) =>
			!excludedPriceIds.has(candidatePrice.id) &&
			getBillingType(candidatePrice.config) === BillingType.FixedCycle,
	);
	return matches.length === 1 ? matches[0] : undefined;
};

/** Matches outgoing items to unique successors; ambiguous matches do not transition. */
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
		const successor =
			findPriceSuccessor({
				sourcePrice,
				candidatePrices: toProduct.prices,
				excludedPriceIds: claimedPriceIds,
			}) ??
			findCrossIntervalFixedPriceSuccessor({
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
