import type { Feature, UpdateCatalogFeatureParams } from "@autumn/shared";

/**
 * The row a features[] entry addresses: by `internal_id` when stated (so a
 * differing `feature_id` is a rename), else by `feature_id`. An unknown
 * internal_id is a caller bug — minting under it would silently disconnect the
 * config from the row it meant to address.
 */
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
		// An id nothing owns names a new resource: fall back to feature_id.
		if (byInternalId) return byInternalId;
	}
	return (
		features.find((candidate) => candidate.id === entry.feature_id) ?? null
	);
};
