import type { TransitionConfig } from "@models/billingModels/context/transitionConfig";
import type { Feature } from "@models/featureModels/featureModels";

export const findTransitionConfigByFeature = ({
	transitionConfigs,
	feature,
}: {
	transitionConfigs?: TransitionConfig[];
	feature: Feature;
}) => {
	if (!transitionConfigs) return undefined;

	return transitionConfigs.find(
		(transitionConfig) => transitionConfig.feature_id === feature.id,
	);
};

export const transitionConfigsUtils = {
	find: {
		byFeature: findTransitionConfigByFeature,
	},
};
