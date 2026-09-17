import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCustomerPrice } from "../../../models/cusProductModels/cusPriceModels/cusPriceModels";
import type { CusProduct } from "../../../models/cusProductModels/cusProductModels";
import type { Entitlement } from "../../../models/productModels/entModels/entModels";
import { entToOptions } from "../../productUtils/convertProductUtils";
import { getStartingBalance } from "../getStartingBalance";

/** What the starting balance reads: the grant, the product's options and quantity, and the prices that size a prepaid grant. */
export type StartingBalanceCustomerEntitlement = Partial<
	Pick<FullCustomerEntitlement, "pooled_balance">
> & {
	id: string;
	customer_product_id: string | null;
	entitlement: Entitlement;
	customer_product:
		| (Pick<CusProduct, "options" | "quantity"> & {
				customer_prices?: FullCustomerPrice[];
		  })
		| null;
};

const hasFullCustomerProduct = (
	cusEnt: StartingBalanceCustomerEntitlement,
): cusEnt is StartingBalanceCustomerEntitlement & {
	customer_product: { customer_prices: FullCustomerPrice[] } | null;
} =>
	cusEnt.customer_product === null ||
	"customer_prices" in cusEnt.customer_product;

export const cusEntToStartingBalance = ({
	cusEnt,
	useUpcomingQuantity = false,
}: {
	cusEnt: StartingBalanceCustomerEntitlement;
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
