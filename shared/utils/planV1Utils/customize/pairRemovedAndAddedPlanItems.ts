import type { PlanItemFilter } from "@api/products/items/filter/planItemFilter.js";
import type { EntitlementPrice } from "@utils/productUtils/entitlementPriceUtils/entitlementPriceTypes.js";
import { PlanItemMatchPrecision } from "../diff/diffPlanV1.js";
import { planItemFilterMatchesEntitlementPrice } from "./planItemFilterMatchesEntitlementPrice.js";

export type PairedRemovedAndAddedPlanItems = {
	replaced: { from: PlanItemFilter; to: EntitlementPrice }[];
	removed: { filter: PlanItemFilter }[];
	leftoverAdds: EntitlementPrice[];
};

const FEATURE_BILLING_METHOD = "feature_billing_method";
const FEATURE = "feature";

/** Strongest first. Last two rungs are weaker than PlanItemMatchPrecision. */
const MATCH_PRECISION_RANK = {
	[PlanItemMatchPrecision.FeatureBillingMethodCadence]: 4,
	[PlanItemMatchPrecision.FeatureCadence]: 3,
	[FEATURE_BILLING_METHOD]: 2,
	[FEATURE]: 1,
} as const;

const matchPrecisionForFilter = ({ filter }: { filter: PlanItemFilter }) => {
	const hasCadence = filter.interval !== undefined;
	const hasBillingMethod = filter.billing_method !== undefined;

	if (hasBillingMethod && hasCadence) {
		return PlanItemMatchPrecision.FeatureBillingMethodCadence;
	}
	if (hasCadence) return PlanItemMatchPrecision.FeatureCadence;
	if (hasBillingMethod) return FEATURE_BILLING_METHOD;
	return FEATURE;
};

const findBestUnclaimedAddIndex = ({
	filter,
	addEntitlementPrices,
	claimedAddIndices,
}: {
	filter: PlanItemFilter;
	addEntitlementPrices: EntitlementPrice[];
	claimedAddIndices: Set<number>;
}): number | undefined => {
	let bestAddIndex: number | undefined;
	let bestRank = -1;

	addEntitlementPrices.forEach((entitlementPrice, addIndex) => {
		if (claimedAddIndices.has(addIndex)) return;
		if (
			!planItemFilterMatchesEntitlementPrice({
				filter,
				entitlementPrice,
			})
		) {
			return;
		}

		const rank =
			MATCH_PRECISION_RANK[matchPrecisionForFilter({ filter })];
		if (bestAddIndex === undefined || rank > bestRank) {
			bestAddIndex = addIndex;
			bestRank = rank;
		}
	});

	return bestAddIndex;
};

/** Greedy per-remove pairing: best unclaimed matching add, claimed by index. */
export const pairRemovedAndAddedPlanItems = ({
	removeItems,
	addEntitlementPrices,
}: {
	removeItems: PlanItemFilter[];
	addEntitlementPrices: EntitlementPrice[];
}): PairedRemovedAndAddedPlanItems => {
	const claimedAddIndices = new Set<number>();
	const replaced: PairedRemovedAndAddedPlanItems["replaced"] = [];
	const removed: PairedRemovedAndAddedPlanItems["removed"] = [];

	for (const filter of removeItems) {
		const addIndex = findBestUnclaimedAddIndex({
			filter,
			addEntitlementPrices,
			claimedAddIndices,
		});
		if (addIndex === undefined) {
			removed.push({ filter });
			continue;
		}

		claimedAddIndices.add(addIndex);
		replaced.push({
			from: filter,
			to: addEntitlementPrices[addIndex]!,
		});
	}

	const leftoverAdds = addEntitlementPrices.filter(
		(_, addIndex) => !claimedAddIndices.has(addIndex),
	);

	return { replaced, removed, leftoverAdds };
};
