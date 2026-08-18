import type { Feature, UpdateCatalogParams } from "@autumn/shared";

/** Existing features this catalog batch updates or removes. */
export const paramsToTouchedFeatures = ({
	features,
	params,
}: {
	features: Feature[];
	params: UpdateCatalogParams;
}): Feature[] => {
	const touchedFeatureIds = new Set([
		...params.features.map((entry) => entry.feature_id),
		...params.remove_features.map((entry) => entry.feature_id),
	]);
	return features.filter((feature) => touchedFeatureIds.has(feature.id));
};
