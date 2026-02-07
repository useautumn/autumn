import {
	FeatureType,
	FeatureUsageType,
} from "@models/featureModels/featureEnums";
import type { Feature } from "@models/featureModels/featureModels";

export const isConsumableFeature = (feature: Feature) => {
	if (feature.type === FeatureType.Boolean) return false;

	return (
		feature.config?.usage_type === FeatureUsageType.Single ||
		feature.type === FeatureType.CreditSystem
	);
};
