import type { FullProduct } from "@models/productModels/productModels";
import { isPrepaidPrice } from "@utils/productUtils/priceUtils/index";

export const productToEmptyFeatureQuantities = ({
	product,
}: {
	product: FullProduct;
}) => {
	return product.prices.filter(isPrepaidPrice).map((price) => ({
		feature_id: price.config.feature_id,
		internal_feature_id: price.config.feature_id,
		quantity: 0,
	}));
};
