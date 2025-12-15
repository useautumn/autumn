import { AllowanceType, FeatureType } from "@autumn/shared";
import { createMockFeature } from "./featureMocks";

export const createMockEntitlement = ({
	featureId,
	internalFeatureId,
	featureName,
	allowance,
	featureType = FeatureType.Metered,
}: {
	featureId: string;
	internalFeatureId?: string;
	featureName: string;
	allowance: number;
	featureType?: FeatureType;
}) => ({
	id: `ent_${featureId}`,
	created_at: Date.now(),
	internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
	internal_product_id: "prod_internal",
	is_custom: false,
	allowance_type: AllowanceType.Fixed,
	allowance,
	interval: null,
	interval_count: 1,
	carry_from_previous: false,
	entity_feature_id: null,
	feature_id: featureId,
	usage_limit: null,
	rollover: null,
	feature: createMockFeature({
		id: featureId,
		internalId: internalFeatureId,
		name: featureName,
		type: featureType,
	}),
});
