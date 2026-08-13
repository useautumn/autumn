import type {
	EntitlementWithFeature,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import {
	type ComputedEntitlementPriceTransitions,
	computeEntitlementPriceTransitions,
} from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeEntitlementPriceTransitions.js";

/** Diffs a license product against a customize of itself. Minted rows swap in
 * for the same feature; removed features drop. Successor matching is the
 * shared one — lifetime → monthly is a transition, not a delete+add. */
export const computeLicenseProductTransitions = ({
	fromLicenseProduct,
	mintedEntitlements,
	removedInternalFeatureIds = [],
}: {
	fromLicenseProduct: FullProductWithoutLicenses;
	mintedEntitlements: EntitlementWithFeature[];
	removedInternalFeatureIds?: string[];
}): ComputedEntitlementPriceTransitions => {
	const droppedFeatureIds = new Set([
		...mintedEntitlements.map(
			(entitlement) => entitlement.internal_feature_id,
		),
		...removedInternalFeatureIds,
	]);

	return computeEntitlementPriceTransitions({
		fromProduct: fromLicenseProduct,
		toProduct: {
			...fromLicenseProduct,
			entitlements: [
				...fromLicenseProduct.entitlements.filter(
					(entitlement) =>
						!droppedFeatureIds.has(entitlement.internal_feature_id),
				),
				...mintedEntitlements,
			],
		},
	});
};
