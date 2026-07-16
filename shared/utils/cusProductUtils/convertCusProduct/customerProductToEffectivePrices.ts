import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import { cusProductToPrices } from "../convertCusProduct";

export const customerProductToEffectivePrices = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): Price[] => [
	...cusProductToPrices({ cusProduct: customerProduct }),
	...(customerProduct.customer_licenses ?? []).flatMap(
		(customerLicense) => customerLicense.planLicense?.product.prices ?? [],
	),
];
