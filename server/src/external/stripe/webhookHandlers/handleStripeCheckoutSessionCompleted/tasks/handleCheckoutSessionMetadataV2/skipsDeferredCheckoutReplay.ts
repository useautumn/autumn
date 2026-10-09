import {
	cusProductToProduct,
	filterCustomerProductsByActiveStatuses,
	type FullCusProduct,
	isCustomerProductPaid,
} from "@autumn/shared";

/** Skip replay when a newer paid product replaced the checkout plan. */
export const skipsDeferredCheckoutReplay = ({
	liveCustomerProducts,
	checkoutProductIds,
	checkoutCreatedAtMs,
}: {
	liveCustomerProducts: FullCusProduct[];
	checkoutProductIds: string[];
	checkoutCreatedAtMs: number;
}): boolean => {
	const livePaidProducts = filterCustomerProductsByActiveStatuses({
		customerProducts: liveCustomerProducts,
	}).filter(isCustomerProductPaid);

	return livePaidProducts.some((customerProduct) => {
		const productId = cusProductToProduct({ cusProduct: customerProduct }).id;
		return (
			!checkoutProductIds.includes(productId) &&
			customerProduct.created_at > checkoutCreatedAtMs
		);
	});
};
