import {
	type EntitlementWithFeature,
	type FullProductWithoutLicenses,
	productToEntitlementPrices,
} from "@autumn/shared";
import {
	computeProductTransitions,
	type ProductTransitions,
} from "./computeProductTransitions";

/** Diffs a product against an add/remove patch of itself.
 *
 * Removals are held out of the diff entirely — the successor matcher's
 * feature-only rung would otherwise pair one with a surviving sibling and call
 * it a transition — so the diff never reports them and they are carried
 * through as `deleted` directly. */
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
	const isRemoved = (entitlementId: string | null | undefined) =>
		entitlementId ? removed.has(entitlementId) : false;

	const survivingProduct = {
		...fromProduct,
		entitlements: fromProduct.entitlements.filter(
			(entitlement) => !isRemoved(entitlement.id),
		),
		prices: fromProduct.prices.filter(
			(price) => !isRemoved(price.entitlement_id),
		),
	};

	const deleted = productToEntitlementPrices({
		product: {
			...fromProduct,
			entitlements: fromProduct.entitlements.filter((entitlement) =>
				isRemoved(entitlement.id),
			),
		},
	});

	const { entitlementPrices, ...transitions } = computeProductTransitions({
		fromProduct: survivingProduct,
		toProduct: {
			...survivingProduct,
			entitlements: [...survivingProduct.entitlements, ...addEntitlements],
		},
	});

	return {
		...transitions,
		entitlementPrices: { ...entitlementPrices, deleted },
	};
};
