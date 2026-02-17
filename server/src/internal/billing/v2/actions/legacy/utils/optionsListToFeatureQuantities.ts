import type { FeatureOptions, FeatureQuantityParamsV0 } from "@autumn/shared";

export const optionsListToFeatureQuantities = ({
	optionsList,
}: {
	optionsList: FeatureOptions[];
}): FeatureQuantityParamsV0[] => {
	return optionsList.map((option) => ({
		feature_id: option.feature_id,
		quantity: option.quantity,
	}));
};
