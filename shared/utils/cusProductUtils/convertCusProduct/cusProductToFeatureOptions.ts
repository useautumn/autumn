import type {
	FeatureOptions,
	FullCusProduct,
} from "../../../models/cusProductModels/cusProductModels.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";

export const cusProductToFeatureOptions = ({
	cusProduct,
	feature,
}: {
	cusProduct?: Pick<FullCusProduct, "options"> | null;
	feature: Feature;
}): FeatureOptions | undefined => {
	return cusProduct?.options.find(
		(option) =>
			option.internal_feature_id === feature.internal_id ||
			option.feature_id === feature.id,
	);
};
