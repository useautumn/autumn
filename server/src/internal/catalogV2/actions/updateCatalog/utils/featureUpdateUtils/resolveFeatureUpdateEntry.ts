import {
	type Feature,
	featureV1ToDbFeature,
	type UpdateCatalogFeatureParams,
} from "@autumn/shared";
import { resolveCurrentFeature } from "./resolveCurrentFeature";

export const resolveFeatureUpdateEntry = ({
	features,
	entry,
}: {
	features: Feature[];
	entry: UpdateCatalogFeatureParams;
}): { current: Feature; next: Feature } | null => {
	const current = resolveCurrentFeature({ features, entry });
	if (!current) return null;

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
