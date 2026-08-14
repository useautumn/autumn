import {
	type EntitlementWithFeature,
	type FullProductWithoutLicenses,
	productToEntitlementPrices,
} from "@autumn/shared";
import {
	computeProductTransitions,
	type ProductTransitions,
} from "./computeProductTransitions";

/** Diffs a product against an add/remove patch of itself. Removals are dropped
 * from both sides and reported directly: left in the from-product, the
 * successor matcher's feature-only rung would pair one with a surviving
 * sibling and call it a transition. */
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
	const survivingProduct = {
		...fromProduct,
		entitlements: fromProduct.entitlements.filter(
			(entitlement) => !removed.has(entitlement.id),
		),
	};

	const transitions = computeProductTransitions({
		fromProduct: survivingProduct,
		toProduct: {
			...survivingProduct,
			entitlements: [...survivingProduct.entitlements, ...addEntitlements],
		},
	});

	return {
		...transitions,
		entitlementPrices: {
			...transitions.entitlementPrices,
			deleted: productToEntitlementPrices({
				product: {
					...fromProduct,
					entitlements: fromProduct.entitlements.filter((entitlement) =>
						removed.has(entitlement.id),
					),
				},
			}),
		},
	};
};
