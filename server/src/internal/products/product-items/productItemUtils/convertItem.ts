import {
	Feature,
	FeatureType,
	ProductItem,
	ProductItemFeatureType,
	UsageModel,
} from "@autumn/shared";

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
	if (!feature) return null;

	if (feature.type == FeatureType.Boolean) {
		return ProductItemFeatureType.Static;
	}

	if (feature.type == FeatureType.CreditSystem) {
		return ProductItemFeatureType.SingleUse;
	}

	return feature.config!.usage_type as ProductItemFeatureType;
};
