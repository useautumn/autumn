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

	// For static (boolean) features, reset_usage_when_enabled is not applicable
	// since they don't track usage. Setting it causes mismatch with backend
	// which doesn't store this field for boolean features.
	const isStaticFeature = itemFeatureType === ProductItemFeatureType.Static;
	const isContinuousUse =
		itemFeatureType === ProductItemFeatureType.ContinuousUse;

	// Create a new item with the selected feature
	const newItem = {
		feature_id: feature.id,
		feature_type: itemFeatureType,
		included_usage: null,
		interval:
			isContinuousUse || isStaticFeature ? null : ProductItemInterval.Month,
		price: null,
		tiers: null,
		billing_units: 1,
		entity_feature_id: null,
		// Only set reset_usage_when_enabled for usage-tracked features
		// Boolean/static features don't track usage, so this field is not applicable
		reset_usage_when_enabled: isStaticFeature ? undefined : !isContinuousUse,
	};

	return newItem;
};
