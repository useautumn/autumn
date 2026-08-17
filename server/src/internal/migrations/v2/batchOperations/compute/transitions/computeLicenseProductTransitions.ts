import type {
	EntitlementWithFeature,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import {
	type ComputedEntitlementPriceTransitions,
	computeEntitlementPriceTransitions,
} from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeEntitlementPriceTransitions.js";

const resetCycleKey = (entitlement: EntitlementWithFeature) =>
	`${entitlement.internal_feature_id}|${entitlement.interval ?? ""}|${entitlement.interval_count ?? 1}`;

/** An item that gains or loses its cycle still moves the rows it granted, but
 * two items on different cycles are siblings -- the seat holds both. */
const sharesResetCycle = ({
	minted,
	existing,
}: {
	minted: EntitlementWithFeature;
	existing: EntitlementWithFeature;
}) =>
	minted.internal_feature_id === existing.internal_feature_id &&
	(minted.interval === null ||
		existing.interval === null ||
		resetCycleKey(minted) === resetCycleKey(existing));

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
	const removedFeatureIds = new Set(removedInternalFeatureIds);

	return computeEntitlementPriceTransitions({
		fromProduct: fromLicenseProduct,
		toProduct: {
			...fromLicenseProduct,
			entitlements: [
				...fromLicenseProduct.entitlements.filter(
					(entitlement) =>
						!removedFeatureIds.has(entitlement.internal_feature_id) &&
						!mintedEntitlements.some((minted) =>
							sharesResetCycle({ minted, existing: entitlement }),
						),
				),
				...mintedEntitlements,
			],
		},
	});
};
