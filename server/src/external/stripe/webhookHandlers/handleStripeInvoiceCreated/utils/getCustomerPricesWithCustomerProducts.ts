import {
	type BillingType,
	type CustomerPriceWithCustomerProduct,
	type FullCusProduct,
	getBillingType,
} from "@autumn/shared";

export const getCustomerPricesWithCustomerProducts = ({
	customerProducts,
	filters,
}: {
	customerProducts: FullCusProduct[];
	filters?: {
		billingType?: BillingType;
	};
}): CustomerPriceWithCustomerProduct[] => {
	const result: CustomerPriceWithCustomerProduct[] = [];

	for (const customerProduct of customerProducts) {
		for (const customerPrice of customerProduct.customer_prices) {
			if (
				filters?.billingType &&
				getBillingType(customerPrice.price.config) !== filters.billingType
			) {
				continue;
			}

			result.push({
				...customerPrice,
				customer_product: customerProduct,
			});
		}
	}

	return result;
};
