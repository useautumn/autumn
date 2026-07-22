import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import type {
	FullCusEntWithFullCusProduct,
	FullCusEntWithProduct,
} from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { entToOptions } from "../../productUtils/convertProductUtils";
import { getStartingBalance } from "../getStartingBalance";

const hasFullCustomerProduct = (
	cusEnt: FullCusEntWithProduct,
): cusEnt is FullCusEntWithFullCusProduct =>
	cusEnt.customer_product === null ||
	"customer_prices" in cusEnt.customer_product;

export const cusEntToStartingBalance = ({
	cusEnt,
	useUpcomingQuantity = false,
}: {
	cusEnt: FullCusEntWithProduct;
	useUpcomingQuantity?: boolean;
}) => {
	if (cusEnt.pooled_balance) return cusEnt.pooled_balance.granted;
	if (!hasFullCustomerProduct(cusEnt)) {
		throw new Error(
			`Customer entitlement '${cusEnt.id}' is missing its customer prices`,
		);
	}

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
