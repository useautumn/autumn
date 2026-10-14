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
	const itemFeatureType = featureToItemFeatureType({
		feature,
	});

	const isStaticFeature = itemFeatureType === ProductItemFeatureType.Static;
	const isContinuousUse =
		itemFeatureType === ProductItemFeatureType.ContinuousUse;

	const newItem = {
		_uid: crypto.randomUUID(),
		feature_id: feature.id,
		feature_type: itemFeatureType,
		included_usage: null,
		interval:
			isContinuousUse || isStaticFeature ? null : ProductItemInterval.Month,
		price: null,
		tiers: null,
		billing_units: 1,
		entity_feature_id: null,
		reset_usage_when_enabled: isStaticFeature ? undefined : !isContinuousUse,
	};

	return newItem;
};
