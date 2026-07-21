import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { entToOptions } from "../../productUtils/convertProductUtils";
import { getStartingBalance } from "../getStartingBalance";

export const cusEntToStartingBalance = ({
	cusEnt,
	useUpcomingQuantity = false,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	useUpcomingQuantity?: boolean;
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	const price = cusPrice?.price;
	const customerProductOptions = entToOptions({
		ent: cusEnt.entitlement,
		options: cusEnt.customer_product?.options ?? [],
	});
	const options =
		useUpcomingQuantity && customerProductOptions
			? {
					...customerProductOptions,
					quantity:
						customerProductOptions.upcoming_quantity ??
						customerProductOptions.quantity,
				}
			: customerProductOptions;

	return getStartingBalance({
		entitlement: cusEnt.entitlement,
		options,
		relatedPrice: price,
		productQuantity: cusEnt.customer_product?.quantity ?? 1,
	});
};
