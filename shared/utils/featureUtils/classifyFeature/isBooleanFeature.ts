import { FeatureType } from "@models/featureModels/featureEnums";
import type { Feature } from "@models/featureModels/featureModels";

export const isBooleanFeature = (feature: Feature) => {
	if (feature.type === FeatureType.Boolean) return true;

	return false;
};
