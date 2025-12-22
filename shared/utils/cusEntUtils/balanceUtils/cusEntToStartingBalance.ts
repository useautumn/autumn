import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { entToOptions } from "../../productUtils/convertProductUtils";
import { cusEntToCusPrice } from "../convertCusEntUtils/cusEntToCusPrice";
import { getStartingBalance } from "../getStartingBalance";

export const cusEntToStartingBalance = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	const price = cusPrice?.price;
	const options = entToOptions({
		ent: cusEnt.entitlement,
		options: cusEnt.customer_product.options,
	});

	return getStartingBalance({
		entitlement: cusEnt.entitlement,
		options,
		relatedPrice: price,
		productQuantity: cusEnt.customer_product.quantity,
	});
};
