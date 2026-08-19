import {
	type Feature,
	featureV1ToDbFeature,
	type UpdateCatalogFeatureParams,
} from "@autumn/shared";

/** A features[] entry matched to the feature it updates, resolved to its desired row. */
export const resolveFeatureUpdateEntry = ({
	features,
	entry,
}: {
	features: Feature[];
	entry: UpdateCatalogFeatureParams;
}): { current: Feature; next: Feature } | null => {
	const current = features.find(
		(candidate) => candidate.id === entry.feature_id,
	);
	if (!current) return null;

	// Strip catalog-only fields so featureV1ToDbFeature doesn't see them.
	const { new_feature_id, archived, ...createParams } = entry;
	const next = featureV1ToDbFeature({
		apiFeature: {
			id: new_feature_id ?? entry.feature_id,
			...createParams,
		},
		originalFeature: current,
	});

	return {
		current,
		next: {
			...next,
			archived: archived ?? current.archived,
		},
	};
};
