import type {
	FeatureOptions,
	FullCusProduct,
} from "../../../models/cusProductModels/cusProductModels.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";

/**
 * Get the feature options for a cus product
 * @param cusProduct - The cus product to get the feature options for
 * @param feature - The feature to get the feature options for
 * @returns The feature options
 */
export const cusProductToFeatureOptions = ({
	cusProduct,
	feature,
}: {
	cusProduct?: FullCusProduct;
	feature: Feature;
}): FeatureOptions | undefined => {
	return cusProduct?.options.find(
		(option) =>
			option.internal_feature_id === feature.internal_id ||
			option.feature_id === feature.id,
	);
};
