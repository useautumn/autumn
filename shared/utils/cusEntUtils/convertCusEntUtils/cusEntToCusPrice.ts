import { InternalError } from "@api/errors/base/InternalError.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { FullCustomerPrice } from "../../../models/cusProductModels/cusPriceModels/cusPriceModels";

// Overload: errorOnNotFound = true → guaranteed FullCustomerPrice
export function cusEntToCusPrice(params: {
	cusEnt: FullCusEntWithFullCusProduct;
	errorOnNotFound: true;
}): FullCustomerPrice;

// Overload: errorOnNotFound = false/undefined → FullCustomerPrice | undefined
export function cusEntToCusPrice(params: {
	cusEnt: FullCusEntWithFullCusProduct;
	errorOnNotFound?: false;
}): FullCustomerPrice | undefined;

// Implementation
export function cusEntToCusPrice({
	cusEnt,
	errorOnNotFound,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	errorOnNotFound?: boolean;
}): FullCustomerPrice | undefined {
	const cusProduct = cusEnt.customer_product;
	const cusPrices = cusProduct?.customer_prices ?? [];
	const result = cusPrices.find((cusPrice: FullCustomerPrice) => {
		const productMatch =
			cusPrice.customer_product_id === cusEnt.customer_product_id;

		const entMatch = cusPrice.price.entitlement_id === cusEnt.entitlement.id;

		return productMatch && entMatch;
	});

	if (errorOnNotFound && !result) {
		throw new InternalError({
			message: `Customer price not found for customer_entitlement: ${cusEnt.id}`,
		});
	}

	return result;
}
