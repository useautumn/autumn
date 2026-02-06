import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import type { Product } from "@models/productModels/productModels";
import { isPrepaidPrice } from "@utils/productUtils/priceUtils/classifyPriceUtils";

export const priceToStripeProductName = ({
	price,
	entitlement,
	product,
}: {
	price: Price;
	entitlement: EntitlementWithFeature;
	product: Product;
}) => {
	if (isPrepaidPrice(price)) {
		return `${product.name} - ${price.config.billing_units} ${entitlement.feature.name}`;
	}

	return `${product.name} - ${entitlement.feature.name}`;
};
