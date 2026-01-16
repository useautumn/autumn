import type { FullCustomerPrice } from "@models/cusProductModels/cusPriceModels/cusPriceModels";
import type { Feature } from "@models/featureModels/featureModels";
import { isPrepaidPrice } from "@utils/productUtils/priceUtils/classifyPriceUtils";

export const findPrepaidCusPriceByFeature = ({
	customerPrices,
	feature,
}: {
	customerPrices: FullCustomerPrice[];
	feature: Feature;
}) => {
	return customerPrices.find((cp) => {
		if (!isPrepaidPrice(cp.price)) return false;
		return cp.price.config.internal_feature_id === feature.internal_id;
	});
};
