import type {
	EntitlementWithFeature,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import {
	computeProductTransitions,
	type ProductTransitions,
} from "./computeProductTransitions";

/** Diffs a product against an add-items patch of itself. The projected
 * to-product is synthetic — it exists only for transition computation. */
export const computePatchProductTransitions = ({
	fromProduct,
	addEntitlements,
}: {
	fromProduct: FullProductWithoutLicenses;
	addEntitlements: EntitlementWithFeature[];
}): ProductTransitions => {
	return computeProductTransitions({
		fromProduct,
		toProduct: {
			...fromProduct,
			entitlements: [...fromProduct.entitlements, ...addEntitlements],
		},
	});
};
