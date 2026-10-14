import { isThresholdBillingPrice } from "@autumn/auto-topup";
import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";

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
