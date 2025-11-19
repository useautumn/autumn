// 1. productV2ToPlanType

import type {
	FrontendProduct,
	ProductV2,
} from "@models/productV2Models/productV2Models.js";
import { isFeaturePriceItem, notNullish } from "@utils/index.js";
import { productV2ToBasePrice } from "@utils/productV3Utils/productItemUtils/productV3ItemUtils.js";

// 2. productV2ToBasePriceType

// 3. productV2ToFrontendProduct
export const productV2ToPlanType = ({
	product,
}: {
	product: ProductV2 | FrontendProduct;
}): FrontendProduct["planType"] => {
	// return product.planType;
	if ("planType" in product) {
		return product.planType;
	}

	// Default
	return null;

	// Backend logic to determine plan type
};

export const productV2ToFrontendProduct = ({
	product,
}: {
	product: ProductV2;
}): FrontendProduct => {
	const basePrice = productV2ToBasePrice({ product });
	const hasPricedFeatures = product.items.some((item) =>
		isFeaturePriceItem(item),
	);

	return {
		...product,
		planType:
			hasPricedFeatures || notNullish(basePrice?.price) ? "paid" : "free",
		basePriceType: basePrice?.interval
			? "recurring"
			: basePrice
				? "one-off"
				: hasPricedFeatures
					? "usage"
					: null,
	};
};

// export const productV2ToBasePriceType = ({
// 	product,
// }: {
// 	product: ProductV2;
// }) => {
// 	return product.basePriceType;
// };
