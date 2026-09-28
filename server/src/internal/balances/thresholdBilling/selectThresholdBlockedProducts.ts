import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { isThresholdBillingPrice } from "./isThresholdBillingPrice.js";

/**
 * A customer can hold several threshold plans, each with its own unpaid
 * invoice, so a paid invoice only clears the plan it names.
 */
export const selectThresholdBlockedProducts = ({
	fullCustomer,
	customerProductId,
}: {
	fullCustomer: FullCustomer;
	customerProductId?: string;
}): FullCusProduct[] =>
	fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.status === CusProductStatus.PastDue &&
			(!customerProductId || customerProduct.id === customerProductId) &&
			customerProduct.customer_prices.some((customerPrice) =>
				isThresholdBillingPrice({ price: customerPrice.price }),
			),
	);
