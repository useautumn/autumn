import type { Feature, UpdateCatalogFeatureParams } from "@autumn/shared";

export const resolveCurrentFeature = ({
	features,
	entry,
}: {
	features: Feature[];
	entry: Pick<UpdateCatalogFeatureParams, "feature_id" | "internal_id">;
}): Feature | null => {
	if (entry.internal_id !== undefined) {
		const byInternalId = features.find(
			(candidate) => candidate.internal_id === entry.internal_id,
		);
		if (byInternalId) return byInternalId;
	}
	return (
		features.find((candidate) => candidate.id === entry.feature_id) ?? null
	);
};
