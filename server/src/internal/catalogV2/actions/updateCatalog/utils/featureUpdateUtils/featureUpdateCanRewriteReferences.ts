import {
	type Feature,
	FeatureType,
	FeatureUsageType,
	type UpdateCatalogFeatureParams,
} from "@autumn/shared";

/**
 * Light setup peek — param fields vs current row only. Does not build `next`.
 * True when applying the entry may rewrite entitlements / prices / credit schemas.
 */
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
