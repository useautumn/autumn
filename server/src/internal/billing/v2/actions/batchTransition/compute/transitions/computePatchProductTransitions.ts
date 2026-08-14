import type {
	EntitlementWithFeature,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import {
	computeProductTransitions,
	type ProductTransitions,
} from "./computeProductTransitions";

/** Diffs a product against an add/remove patch of itself. Removals diff
 * separately: the successor matcher falls back to feature-only precision, so
 * one left in the from-product would claim a surviving sibling. */
export const computePatchProductTransitions = ({
	fromProduct,
	addEntitlements,
	removeEntitlementIds = [],
}: {
	fromProduct: FullProductWithoutLicenses;
	addEntitlements: EntitlementWithFeature[];
	removeEntitlementIds?: string[];
}): ProductTransitions => {
	const removed = new Set(removeEntitlementIds);
	const surviving = fromProduct.entitlements.filter(
		(entitlement) => !removed.has(entitlement.id),
	);

	const transitions = computeProductTransitions({
		fromProduct: { ...fromProduct, entitlements: surviving },
		toProduct: {
			...fromProduct,
			entitlements: [...surviving, ...addEntitlements],
		},
	});
	if (removed.size === 0) return transitions;

	const deleted = computeProductTransitions({
		fromProduct: {
			...fromProduct,
			entitlements: fromProduct.entitlements.filter((entitlement) =>
				removed.has(entitlement.id),
			),
		},
		toProduct: { ...fromProduct, entitlements: [] },
	});

	return {
		...transitions,
		entitlementPrices: {
			...transitions.entitlementPrices,
			deleted: deleted.entitlementPrices.deleted,
		},
	};
};
