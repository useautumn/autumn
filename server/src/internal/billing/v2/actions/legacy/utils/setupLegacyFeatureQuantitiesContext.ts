import { isConsumableFeature } from "@shared/utils/featureUtils/classifyFeature/isConsumableFeature";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const setupLegacyTransitionContext = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	// const { optionsList } = attachParams;

	const consumableFeatures = attachParams.products
		.flatMap((product) => product.entitlements)
		.filter((ent) => isConsumableFeature(ent.feature))
		.map((ent) => ent.feature);

	return consumableFeatures.map((f) => ({
		feature_id: f.id,
		reset_after_trial_end: true,
	}));

	// const newOptions: FeatureOptionsParamsV0[] = [];
	// for (const feature of consumableFeatures) {
	// 	const option = optinsList?.find(
	// 		(option) => option.feature_id === feature.id,
	// 	);
	// 	newOptions.push({
	// 		internal_feature_id:
	// 		feature_id: feature.id,
	// 		reset_after_trial_end: true,
	// 		quantity: option?.quantity || undefined,
	// 	});
	// }

	// for (const option of body.options ?? []) {
	// 	const newOptionsAlreadyExists = newOptions.some(
	// 		(newOption) => newOption.feature_id === option.feature_id,
	// 	);
	// 	if (newOptionsAlreadyExists) {
	// 		continue;
	// 	}
	// 	newOptions.push({
	// 		feature_id: option.feature_id,
	// 		quantity: option.quantity || undefined,
	// 	});
	// }
};
