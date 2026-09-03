import {
	ErrCode,
	type Feature,
	RecaseError,
	type UpdateCatalogFeatureParams,
} from "@autumn/shared";

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
		if (!byInternalId) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message: `No feature exists for internal_id ${entry.internal_id}`,
				statusCode: 400,
			});
		}
		return byInternalId;
	}
	return (
		features.find((candidate) => candidate.id === entry.feature_id) ?? null
	);
};
