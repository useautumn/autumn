import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import { entToOptions } from "@utils/productUtils/convertProductUtils";
import { isLosingPrepaidQuantityPrice } from "@utils/productUtils/priceUtils/findPrice/findPrepaidQuantityTargetPrice";
import { cusEntToCusPrice } from "./cusEntToCusPrice";

export const customerEntitlementToOptions = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
}) => {
	// Tie-break: options are feature-keyed, so a losing prepaid price (one-off
	// alongside a recurring prepaid of the same feature) must not read them.
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
		return undefined;
	}

	return entToOptions({
		ent: customerEntitlement.entitlement,
		options: customerEntitlement.customer_product?.options ?? [],
	});
};
