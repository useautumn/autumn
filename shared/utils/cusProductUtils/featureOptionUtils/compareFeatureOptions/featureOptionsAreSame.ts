import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";

const matchesFeature = ({
	featureOptions,
	candidate,
}: {
	featureOptions: FeatureOptions;
	candidate: FeatureOptions;
}) =>
	candidate.internal_feature_id === featureOptions.internal_feature_id ||
	candidate.feature_id === featureOptions.feature_id;

export const featureOptionsAreSame = ({
	curFeatureOptions,
	newFeatureOptions,
}: {
	curFeatureOptions: FeatureOptions[];
	newFeatureOptions: FeatureOptions[];
}) =>
	curFeatureOptions.length === newFeatureOptions.length &&
	curFeatureOptions.every(
		(featureOptions) =>
			newFeatureOptions.find((candidate) =>
				matchesFeature({ featureOptions, candidate }),
			)?.quantity === featureOptions.quantity,
	);
