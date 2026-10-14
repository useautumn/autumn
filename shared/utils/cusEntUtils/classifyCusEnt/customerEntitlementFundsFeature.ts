import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import { creditSystemContainsFeature } from "../../featureUtils/creditSystemUtils.js";
import { entitlementToCreditSystem } from "../../productUtils/entUtils/convertEnt/entitlementToCreditSystem.js";

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
