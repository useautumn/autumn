// 1. productV2ToPlanType

import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels.js";
import type {
	FrontendProduct,
	ProductV2,
} from "@models/productV2Models/productV2Models.js";
import { isFeaturePriceItem, notNullish, nullish } from "@utils/index.js";
import { productV2ToBasePrice } from "@utils/productV3Utils/productItemUtils/productV3ItemUtils.js";

// The API mirrors `price_interval` onto priced items even when it just echoes
// `interval`; drop it so editors treat "split" as price_interval being set.
export const normalizeResetInterval = (item: ProductItem): ProductItem => {
	if (nullish(item.price_interval)) return item;

	const sameInterval = item.price_interval === item.interval;
	const sameCount =
		(item.price_interval_count ?? 1) === (item.interval_count ?? 1);
	if (sameInterval && sameCount) {
		return { ...item, price_interval: null, price_interval_count: null };
	}

	return item;
};

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
		items: product.items.map(normalizeResetInterval),
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
