import type { Feature } from "@models/featureModels/featureModels";

export const findFeatureByInternalId = ({
	features,
	internalId,
}: {
	features: Feature[];
	internalId: string;
}): Feature | undefined => {
	return features.find((feature) => feature.internal_id === internalId);
};
