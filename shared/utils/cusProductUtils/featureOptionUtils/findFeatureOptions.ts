import { InternalError } from "@api/errors";
import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";
import type { Feature } from "@models/featureModels/featureModels";

/**
 * Find the feature options for a feature
 * @param featureOptions - The feature options to search through
 * @param feature - The feature to find the options for
 * @returns The feature options, or undefined if not found
 */
export const findFeatureOptionsByFeature = ({
	featureOptions,
	feature,
}: {
	featureOptions: FeatureOptions[];
	feature: Feature;
}) => {
	const options = featureOptions.find(
		(oldOption) =>
			oldOption.internal_feature_id === feature.internal_id ||
			oldOption.feature_id === feature.id,
	);

	if (!options) {
		throw new InternalError({
			message: `[Find Feature Options By Feature] Cannot find feature options for feature: ${feature.id}.`,
		});
	}
	return options;
};
