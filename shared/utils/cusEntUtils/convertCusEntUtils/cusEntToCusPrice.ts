import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { FullCustomerPrice } from "../../../models/cusProductModels/cusPriceModels/cusPriceModels";

export const cusEntToCusPrice = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const cusProduct = cusEnt.customer_product;
	const cusPrices = cusProduct?.customer_prices ?? [];
	return cusPrices.find((cusPrice: FullCustomerPrice) => {
		const productMatch =
			cusPrice.customer_product_id === cusEnt.customer_product_id;

		const entMatch = cusPrice.price.entitlement_id === cusEnt.entitlement.id;

		return productMatch && entMatch;
	});
};
