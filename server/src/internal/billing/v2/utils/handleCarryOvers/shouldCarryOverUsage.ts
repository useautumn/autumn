import {
	type CarryOverUsages,
	type EntitlementWithFeature,
	featureUtils,
} from "@autumn/shared";

/** Mirrors attach: allocated usage always carries, `carry_from_previous`
 * carries its own entitlement, and the param carries listed consumables. */
export const shouldCarryOverUsage = ({
	toEntitlement,
	carryOverUsages,
}: {
	toEntitlement: EntitlementWithFeature;
	carryOverUsages: CarryOverUsages;
}): boolean => {
	if (featureUtils.isAllocated(toEntitlement.feature)) return true;
	if (toEntitlement.carry_from_previous) return true;
	if (!carryOverUsages?.enabled) return false;
	if (!carryOverUsages.feature_ids) return true;
	return carryOverUsages.feature_ids.includes(toEntitlement.feature.id);
};
