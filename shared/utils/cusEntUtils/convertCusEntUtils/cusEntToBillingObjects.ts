import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { FullCustomerPrice } from "@models/cusProductModels/cusPriceModels/cusPriceModels";
import type {
	FeatureOptions,
	FullCusProduct,
} from "@models/cusProductModels/cusProductModels";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type { Price } from "@models/productModels/priceModels/priceModels";
import type { FullProduct } from "@models/productModels/productModels";
import { cusProductToProduct } from "@utils/cusProductUtils/convertCusProduct";
import { cusEntToCusPrice } from "./cusEntToCusPrice";
import { customerEntitlementToOptions } from "./customerEntitlementToOptions";

export type CusEntBillingObjects = {
	cusProduct: FullCusProduct;
	cusPrice: FullCustomerPrice;
	price: Price;
	product: FullProduct;
	entitlement: EntitlementWithFeature;
	options: FeatureOptions | undefined;
};

/**
 * Extracts the core billing objects from a FullCusEntWithFullCusProduct.
 * Returns null if cusProduct or cusPrice can't be resolved.
 */
export const cusEntToBillingObjects = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}): CusEntBillingObjects | null => {
	const cusProduct = cusEnt.customer_product;
	if (!cusProduct) return null;

	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) return null;

	const price = cusPrice.price;
	const product = cusProductToProduct({ cusProduct });
	const entitlement = cusEnt.entitlement;
	const options = customerEntitlementToOptions({ customerEntitlement: cusEnt });

	return { cusProduct, cusPrice, price, product, entitlement, options };
};
