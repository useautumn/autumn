import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import { creditSystemContainsFeature } from "../../featureUtils/creditSystemUtils.js";
import { entitlementToCreditSystem } from "../../productUtils/entUtils/convertEnt/entitlementToCreditSystem.js";

/**
 * Whether this customer entitlement's balance can fund usage of a feature:
 * it is the feature's own balance, or a credit system whose EFFECTIVE schema
 * (plan-item feature_override, else catalog config) contains the feature.
 * Membership must be judged per entitlement, not per catalog feature — two
 * plan items on the same credit system can carry different overrides.
 */
export const customerEntitlementFundsFeature = ({
	customerEntitlement,
	featureId,
}: {
	customerEntitlement: Pick<FullCustomerEntitlement, "entitlement">;
	featureId: string;
}): boolean => {
	if (customerEntitlement.entitlement.feature.id === featureId) return true;

	return creditSystemContainsFeature({
		creditSystem: entitlementToCreditSystem({
			entitlement: customerEntitlement.entitlement,
		}),
		meteredFeatureId: featureId,
	});
};
