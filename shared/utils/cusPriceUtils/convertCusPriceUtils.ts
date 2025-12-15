import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCustomerPrice } from "../../models/cusProductModels/cusPriceModels/cusPriceModels";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels";

export const cusPriceToCusEnt = ({
	cusPrice,
	cusEnts,
}: {
	cusPrice: FullCustomerPrice;
	cusEnts: FullCustomerEntitlement[];
}) => {
	return cusEnts.find(
		(ce) => ce.entitlement?.id === cusPrice.price.entitlement_id,
	);
};

export const cusPriceToCusEntWithCusProduct = ({
	cusProduct,
	cusPrice,
	cusEnts,
}: {
	cusProduct: FullCusProduct;
	cusPrice: FullCustomerPrice;
	cusEnts: FullCustomerEntitlement[];
}) => {
	const cusEnt = cusPriceToCusEnt({ cusPrice, cusEnts });

	if (!cusEnt) {
		return undefined;
	}

	return {
		...cusEnt,
		customer_product: cusProduct,
	};
};
