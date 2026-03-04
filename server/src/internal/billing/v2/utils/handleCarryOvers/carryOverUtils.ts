import type { AttachParamsV1, FullCustomerEntitlement } from "@autumn/shared";
import {
	deduplicateArray,
	featureUtils,
	isBooleanCusEnt,
	isUnlimitedCusEnt,
} from "@autumn/shared";

/** Mutates featuresToCarryUsagesFor with consumable feature IDs from carry_over_usages params and returns it. */
export const applyCarryOverUsageFeatureIds = ({
	params,
	currentCustomerEntitlements,
	featuresToCarryUsagesFor,
}: {
	params: AttachParamsV1;
	currentCustomerEntitlements: FullCustomerEntitlement[];
	featuresToCarryUsagesFor: string[];
}): string[] => {
	const carryOverUsages = params.carry_over_usages;
	if (!carryOverUsages?.enabled) return featuresToCarryUsagesFor;

	const allConsumableFeatureIds = deduplicateArray(
		currentCustomerEntitlements
			.filter(
				(ce) =>
					!isBooleanCusEnt({ cusEnt: ce }) &&
					!isUnlimitedCusEnt(ce) &&
					!featureUtils.isAllocated(ce.entitlement.feature),
			)
			.map((ce) => ce.entitlement.feature.id),
	);

	const overrideFeatureIds = carryOverUsages.feature_ids
		? allConsumableFeatureIds.filter((id) =>
				carryOverUsages.feature_ids!.includes(id),
			)
		: allConsumableFeatureIds;

	featuresToCarryUsagesFor.splice(
		0,
		featuresToCarryUsagesFor.length,
		...overrideFeatureIds,
	);

	return featuresToCarryUsagesFor;
};
