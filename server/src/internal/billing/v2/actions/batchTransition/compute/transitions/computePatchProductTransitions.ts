import type {
	EntitlementWithFeature,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import {
	computeProductTransitions,
	type ProductTransitions,
} from "./computeProductTransitions";

/** Diffs a product against an add/remove patch of itself. The projected
 * to-product is synthetic — it exists only for transition computation. */
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

	return computeProductTransitions({
		fromProduct,
		toProduct: {
			...fromProduct,
			entitlements: [
				...fromProduct.entitlements.filter(
					(entitlement) => !removed.has(entitlement.id),
				),
				...addEntitlements,
			],
		},
	});
};
