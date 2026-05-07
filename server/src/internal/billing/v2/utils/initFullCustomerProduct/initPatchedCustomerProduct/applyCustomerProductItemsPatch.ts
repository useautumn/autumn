import type {
	FullCusProduct,
	FullCustomerEntitlement,
	FullCustomerPrice,
} from "@autumn/shared";

export const applyCustomerProductItemsPatch = ({
	customerProduct,
	insertCustomerPrices,
	insertCustomerEntitlements,
	deleteCustomerPrices,
	deleteCustomerEntitlements,
}: {
	customerProduct: FullCusProduct;
	insertCustomerPrices: FullCustomerPrice[];
	insertCustomerEntitlements: FullCustomerEntitlement[];
	deleteCustomerPrices: FullCustomerPrice[];
	deleteCustomerEntitlements: FullCustomerEntitlement[];
}): FullCusProduct => {
	const deleteCustomerPriceIds = new Set(
		deleteCustomerPrices.map((customerPrice) => customerPrice.id),
	);
	const deleteCustomerEntitlementIds = new Set(
		deleteCustomerEntitlements.map(
			(customerEntitlement) => customerEntitlement.id,
		),
	);

	return {
		...customerProduct,
		customer_prices: [
			...customerProduct.customer_prices.filter(
				(customerPrice) => !deleteCustomerPriceIds.has(customerPrice.id),
			),
			...insertCustomerPrices,
		],
		customer_entitlements: [
			...customerProduct.customer_entitlements.filter(
				(customerEntitlement) =>
					!deleteCustomerEntitlementIds.has(customerEntitlement.id),
			),
			...insertCustomerEntitlements,
		],
	};
};
