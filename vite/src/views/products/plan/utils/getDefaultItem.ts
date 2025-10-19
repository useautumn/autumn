import {
	type CreateFeature,
	type Feature,
	featureToItemFeatureType,
	ProductItemFeatureType,
	ProductItemInterval,
} from "@autumn/shared";

export const getDefaultItem = ({
	feature,
}: {
	feature: Feature | CreateFeature;
}) => {
	// Determine feature_type based on feature.type and config.usage_type
	const itemFeatureType = featureToItemFeatureType({
		feature,
	});

	// Create a new item with the selected feature
	const newItem = {
		feature_id: feature.id,
		feature_type: itemFeatureType,
		included_usage: null,
		interval:
			itemFeatureType === ProductItemFeatureType.ContinuousUse ||
			itemFeatureType === ProductItemFeatureType.Static
				? null
				: ProductItemInterval.Month,
		price: null,
		tiers: null,
		billing_units: 1,
		entity_feature_id: null,
		reset_usage_when_enabled:
			itemFeatureType !== ProductItemFeatureType.ContinuousUse,
	};

	return newItem;
};
