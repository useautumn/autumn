import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	type UpdateCatalogFeatureParams,
} from "@autumn/shared";

export const featureUpdateCanRewriteReferences = ({
	current,
	entry,
}: {
	current: Feature;
	entry: UpdateCatalogFeatureParams;
}): boolean => {
	if (entry.new_feature_id != null && entry.new_feature_id !== current.id) {
		return true;
	}
	if (entry.type !== current.type) return true;

	if (
		current.type !== FeatureType.Boolean &&
		entry.type !== FeatureType.Boolean &&
		entry.consumable != null
	) {
		const nextUsageType = entry.consumable
			? FeatureUsageType.Single
			: FeatureUsageType.Continuous;
		if (current.config?.usage_type !== nextUsageType) return true;
	}

	return false;
};
