import type {
	FeatureOptions,
	FullCusProduct,
} from "@models/cusProductModels/cusProductModels";
import type { Feature } from "@models/featureModels/featureModels";
/**
 * Get the feature quantity for a cus product
 * @param cusProduct - The cus product to get the feature quantity for
 * @returns The feature quantity
 */
export const cusProductToFeatureOptions = ({
	cusProduct,
	feature,
}: {
	cusProduct: FullCusProduct;
	feature: Feature;
}): FeatureOptions | undefined => {
	return cusProduct.options.find(
		(option) =>
			option.internal_feature_id === feature.internal_id ||
			option.feature_id === feature.id,
	);
};
