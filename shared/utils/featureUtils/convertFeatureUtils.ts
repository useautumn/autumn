import {
	FeatureType,
	FeatureUsageType,
} from "@models/featureModels/featureEnums.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import { ProductItemFeatureType } from "@models/productV2Models/productItemModels/productItemModels.js";
import { ApiFeatureType } from "../../api/models.js";
import { FeatureOptions } from "../../models/cusProductModels/cusProductModels.js";

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

export const featureV0ToV1Type = ({
	type,
}: {
	type: ApiFeatureType;
}): { type: FeatureType; consumable?: boolean } => {
	let featureType = type as unknown as FeatureType;
	let consumable: boolean = false;
	if (
		type === ApiFeatureType.SingleUsage ||
		type === ApiFeatureType.ContinuousUse
	) {
		featureType = FeatureType.Metered;
		consumable = type === ApiFeatureType.SingleUsage;
	} else if (type === ApiFeatureType.CreditSystem) {
		featureType = FeatureType.CreditSystem;
		consumable = true;
	} else if (type === ApiFeatureType.Static) {
		featureType = FeatureType.Boolean;
		consumable = false;
	}

	return { type: featureType, consumable };
};

export const isContUseFeature = ({ feature }: { feature: Feature }) => {
	return feature.config?.usage_type === FeatureUsageType.Continuous;
};

export const isBooleanFeature = ({ feature }: { feature: Feature }) => {
	return feature.type === FeatureType.Boolean;
};

export const featureToOptions = ({ feature, options }: { feature: Feature, options: FeatureOptions[] }) => {
	// Check if options has internal feature id
	const option = options.find(o => o.internal_feature_id === feature.internal_id);
	if (option) return option;

	const option2 = options.find(o => o.feature_id === feature.id);
	if (option2) return option2;

	return;
};