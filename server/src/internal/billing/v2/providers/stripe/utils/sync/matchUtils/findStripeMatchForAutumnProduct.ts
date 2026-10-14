import {
	type FullProduct,
	isFixedPrice,
	productToStripeIds,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { ProductMatchCondition } from "./matchConditions";

export const findStripeMatchForAutumnProduct = ({
	product,
	stripeProductIds,
}: {
	product: FullProduct;
	stripeProductIds: Set<string>;
}): ProductMatchCondition | null => {
	for (const stripeProductId of productToStripeIds({ product })) {
		if (stripeProductIds.has(stripeProductId)) {
			return { type: "stripe_product_id", stripe_product_id: stripeProductId };
		}
	}

	for (const price of product.prices) {
		if (isFixedPrice(price)) continue;
		const stripeProductId = (price.config as UsagePriceConfig)
			.stripe_product_id;
		if (stripeProductId && stripeProductIds.has(stripeProductId)) {
			return { type: "stripe_product_id", stripe_product_id: stripeProductId };
		}
	}

	return null;
};
