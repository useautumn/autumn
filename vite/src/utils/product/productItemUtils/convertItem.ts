import {
	type Feature,
	FeatureType,
	type ProductItem,
	ProductItemFeatureType,
} from "@autumn/shared";

export const itemToFeature = ({
	item,
	features,
}: {
	item: ProductItem;
	features: Feature[];
}) => {
	return features.find((f) => f.id === item.feature_id);
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

	if (feature.type === FeatureType.Boolean) {
		return ProductItemFeatureType.Static;
	}

	if (feature.type === FeatureType.CreditSystem) {
		return ProductItemFeatureType.SingleUse;
	}

	return feature.config?.usage_type as ProductItemFeatureType;
};
