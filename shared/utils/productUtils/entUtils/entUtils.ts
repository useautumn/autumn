import type { Entity } from "../../../models/cusModels/entityModels/entityModels";
import type { EntitlementWithFeature } from "../../../models/productModels/entModels/entModels";

export const entitlementFeatureMatchesEntityFeature = ({
	entitlement,
	entity,
}: {
	entitlement: EntitlementWithFeature;
	entity: Entity;
}) => {
	return entitlement.feature.internal_id === entity.internal_feature_id;
};
