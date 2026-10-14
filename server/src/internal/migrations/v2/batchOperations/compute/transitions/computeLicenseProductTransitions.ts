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
