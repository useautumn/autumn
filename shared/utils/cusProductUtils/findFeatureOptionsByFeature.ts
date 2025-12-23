import { InternalError } from "@api/errors";
import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";

export const findFeatureOptionsByFeature = ({
	featureOptions,
	featureId,
}: {
	featureOptions: FeatureOptions[];
	featureId: string;
}) => {
	const previousOption = featureOptions.find(
		(oldOption) => oldOption.feature_id === featureId,
	);

	if (!previousOption) {
		throw new InternalError({
			message: `[Find Feature Options By Feature] Cannot find feature options for feature: ${featureId}.`,
		});
	}
	return previousOption;
};
