import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import { entToOptions } from "@utils/productUtils/convertProductUtils";
import { isLosingPrepaidQuantityPrice } from "@utils/productUtils/priceUtils/findPrice/findPrepaidQuantityTargetPrice";
import { cusEntToCusPrice } from "./cusEntToCusPrice";

export const customerEntitlementToOptions = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
}) => {
	const options = entToOptions({
		ent: customerEntitlement.entitlement,
		options: customerEntitlement.customer_product?.options ?? [],
	});
	if (!options) return undefined;

	const cusPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	const siblingPrices =
		customerEntitlement.customer_product?.customer_prices.map(
			(customerPrice) => customerPrice.price,
		) ?? [];

	if (
		cusPrice &&
		isLosingPrepaidQuantityPrice({
			price: cusPrice.price,
			prices: siblingPrices,
		})
	) {
		return { ...options, quantity: 0, upcoming_quantity: null };
	}

	return options;
};
