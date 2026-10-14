import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";

export const filterPerEntityCustomerEntitlementsByFeature = <
	T extends FullCustomerEntitlement,
>({
	customerEntitlements,
	feature,
}: {
	customerEntitlements: T[];
	feature: Feature;
}): T[] =>
	customerEntitlements.filter(
		(customerEntitlement) =>
			customerEntitlement.entitlement.entity_feature_id === feature.id,
	);
