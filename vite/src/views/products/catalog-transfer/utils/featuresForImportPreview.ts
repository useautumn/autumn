import {
	type Feature,
	featureV1ToDbFeature,
	type UpdateCatalogParamsInput,
} from "@autumn/shared";

const requestFeatureToFeature = (
	feature: NonNullable<UpdateCatalogParamsInput["features"]>[number],
): Feature | null => {
	const { feature_id, ...apiFeature } = feature;
	try {
		return featureV1ToDbFeature({
			apiFeature: { id: feature_id, ...apiFeature },
		}) as Feature;
	} catch {
		return null;
	}
};

/** Plan diffs resolve item names from features; ones this import creates aren't in the org yet. */
export const featuresForImportPreview = ({
	orgFeatures,
	request,
}: {
	orgFeatures: Feature[];
	request: UpdateCatalogParamsInput;
}): Feature[] => {
	const orgIds = new Set(orgFeatures.map((feature) => feature.id));
	const created = (request.features ?? [])
		.filter((feature) => !orgIds.has(feature.feature_id))
		.map(requestFeatureToFeature)
		.filter((feature): feature is Feature => feature !== null);
	return [...orgFeatures, ...created];
};
