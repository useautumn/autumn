import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";

/** Rows granted per entity of this feature: `entity_feature_id` set, balances in the `entities` map. */
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
