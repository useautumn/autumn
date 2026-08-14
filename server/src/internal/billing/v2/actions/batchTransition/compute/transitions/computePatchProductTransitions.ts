import type {
	EntitlementWithFeature,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import {
	computeProductTransitions,
	type ProductTransitions,
} from "./computeProductTransitions";

/** Diffs a product against an add/remove patch of itself. The projected
 * to-product is synthetic — it exists only for transition computation.
 *
 * Removals are diffed on their own: the successor matcher falls back to
 * feature-only precision, so a removed entitlement left in the from-product
 * would claim a surviving same-feature sibling and report a transition. */
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
