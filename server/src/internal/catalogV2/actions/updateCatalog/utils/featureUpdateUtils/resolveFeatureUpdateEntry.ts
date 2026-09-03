import {
	type Feature,
	featureV1ToDbFeature,
	type UpdateCatalogFeatureParams,
} from "@autumn/shared";
import { resolveCurrentFeature } from "./resolveCurrentFeature";

/** A features[] entry matched to the feature it updates, resolved to its desired row. */
export const resolveFeatureUpdateEntry = ({
	features,
	entry,
}: {
	features: Feature[];
	entry: UpdateCatalogFeatureParams;
}): { current: Feature; next: Feature } | null => {
	const current = resolveCurrentFeature({ features, entry });
	if (!current) return null;

	// Strip catalog-only fields so featureV1ToDbFeature doesn't see them. With
	// internal_id matching, feature_id itself is the desired id — a rename when
	// it differs from the row's current id.
	const { new_feature_id, archived, internal_id, ...createParams } = entry;
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
