import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";
import type { Feature } from "@models/featureModels/featureModels";
import type { AutumnLogger } from "../../../types";

export const findFeatureOptionsByFeature = ({
	featureOptions,
	feature,
	logger,
}: {
	featureOptions: FeatureOptions[];
	feature: Feature;
	logger: AutumnLogger;
}) => {
	const options = featureOptions.find(
		(oldOption) =>
			oldOption.internal_feature_id === feature.internal_id ||
			oldOption.feature_id === feature.id,
	);

	if (!options) {
		logger.warn(
			`[Find Feature Options By Feature] Cannot find feature options for feature: ${feature.id}.`,
		);
	}
	return (
		options ?? {
			feature_id: feature.id,
			internal_feature_id: feature.internal_id,
			quantity: 0,
		}
	);
};
