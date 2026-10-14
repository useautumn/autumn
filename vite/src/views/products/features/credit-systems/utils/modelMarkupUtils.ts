import {
	CUSTOM_PROVIDER,
	isCustomModel,
	joinModelId,
	type ModelMarkups,
} from "@autumn/shared";

type ModelMarkupMap = NonNullable<ModelMarkups>;

export const addCustomModelMarkup = (prev: ModelMarkupMap): ModelMarkupMap => {
	const existing = Object.keys(prev).filter((key) => isCustomModel(key));
	let index = 1;
	while (existing.includes(joinModelId(CUSTOM_PROVIDER, `model-${index}`))) {
		index++;
	}
	return {
		...prev,
		[joinModelId(CUSTOM_PROVIDER, `model-${index}`)]: {
			input_cost: 0,
			output_cost: 0,
		},
	};
};
