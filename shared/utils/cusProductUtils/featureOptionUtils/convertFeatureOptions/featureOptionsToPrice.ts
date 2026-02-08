import type { FeatureOptions } from "@models/cusProductModels/cusProductModels";
import type { FullProduct } from "@models/productModels/productModels";

export const featureOptionsToPrice = ({
	featureOptions,
	product,
}: {
	featureOptions: FeatureOptions;
	product: FullProduct;
}) => {
	const price = product.prices.find(
		(price) =>
			price.config.internal_feature_id === featureOptions.internal_feature_id ||
			price.config.feature_id === featureOptions.feature_id,
	);

	return price;
};
