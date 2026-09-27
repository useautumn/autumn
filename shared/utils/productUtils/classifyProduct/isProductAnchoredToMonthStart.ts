import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import type { FullProduct } from "@models/productModels/productModels";
import { getSmallestInterval } from "@utils/intervalUtils/priceIntervalUtils";
import { isOneOffProduct } from "@utils/productUtils/classifyProduct/classifyProductUtils";

/** One-off and weekly plans ignore the flag: they have no monthly cycle to anchor. */
export const isProductAnchoredToMonthStart = ({
	product,
}: {
	product: FullProduct;
}) => {
	if (product.config?.anchor_to_month_start !== true) return false;
	if (isOneOffProduct({ product })) return false;

	const smallestInterval = getSmallestInterval({
		prices: product.prices,
		excludeOneOff: true,
	});
	return smallestInterval?.interval !== BillingInterval.Week;
};
