import {
	FeatureType,
	FeatureUsageType,
} from "@models/featureModels/featureEnums.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import { ProductItemFeatureType } from "@models/productV2Models/productItemModels/productItemModels.js";

export const featureToItemFeatureType = ({ feature }: { feature: Feature }) => {
	let featureType: ProductItemFeatureType;
	if (feature.type === FeatureType.Boolean) {
		featureType = ProductItemFeatureType.Static;
	} else if (feature.type === FeatureType.CreditSystem) {
		featureType = ProductItemFeatureType.SingleUse;
	} else if (feature.type === FeatureType.Metered) {
		const usageType = feature.config?.usage_type;
		if (usageType === FeatureUsageType.Continuous) {
			featureType = ProductItemFeatureType.ContinuousUse;
		} else {
			featureType = ProductItemFeatureType.SingleUse;
		}
	} else {
		// Fallback
		featureType = ProductItemFeatureType.SingleUse;
	}

	return featureType;
};

export const isContUseFeature = ({ feature }: { feature: Feature }) => {
	return feature.config?.usage_type === FeatureUsageType.Continuous;
};

export const isBooleanFeature = ({ feature }: { feature: Feature }) => {
	return feature.type === FeatureType.Boolean;
};
