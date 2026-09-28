import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { isOneOffPrice } from "@utils/productUtils/priceUtils/classifyPriceUtils";
import { cusProductToPrices } from "../convertCusProduct";

export const customerProductToEffectivePrices = ({
	customerProduct,
}: {
	customerProduct: Pick<
		FullCusProduct,
		"customer_prices" | "customer_licenses"
	>;
}): Price[] => [
	...cusProductToPrices({ cusProduct: customerProduct }),
	...(customerProduct.customer_licenses ?? []).flatMap(
		(customerLicense) => customerLicense.planLicense?.product.prices ?? [],
	),
];

export const customerProductsToEffectivePrices = ({
	customerProducts,
	filters,
}: {
	customerProducts: FullCusProduct[];
	filters?: { excludeOneOffPrices?: boolean };
}): Price[] => {
	let prices = customerProducts.flatMap((customerProduct) =>
		customerProductToEffectivePrices({ customerProduct }),
	);

	if (filters?.excludeOneOffPrices) {
		prices = prices.filter((price) => !isOneOffPrice(price));
	}

	return prices;
};
