import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import {
	type ProductItem,
	ProductItemFeatureType,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";

export const itemToFeature = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const feature = features.find((f) => f.id === item.feature_id);

	return feature;
};

export const itemToUsageType = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	const feature = itemToFeature({ item, features });
	if (!feature || !feature.config) return null;

	if (feature.type === FeatureType.Boolean) {
		return ProductItemFeatureType.Static;
	}

	if (feature.type === FeatureType.CreditSystem) {
		return ProductItemFeatureType.SingleUse;
	}

	return feature.config.usage_type as ProductItemFeatureType;
};
