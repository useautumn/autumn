import {
	customerProductsHaveDuplicateProductId,
	ErrCode,
	type FullCusProduct,
	filterCustomerProductsByActiveStatuses,
	isAllocatedPrice,
	isVolumePrice,
	RecaseError,
} from "@autumn/shared";

/** Allocated volume prices have no per-copy Stripe price, so copies of one plan would add
 * their seats into one Stripe item and be priced at a tier none of them reached alone. */
export const handleSharedVolumeSeatPriceErrors = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}) => {
	const activeCustomerProducts = filterCustomerProductsByActiveStatuses({
		customerProducts,
	});

	const sharedVolumeSeatPlan = activeCustomerProducts.find(
		(customerProduct) =>
			customerProduct.customer_prices.some(
				({ price }) => isAllocatedPrice(price) && isVolumePrice(price),
			) &&
			customerProductsHaveDuplicateProductId({
				customerProducts: activeCustomerProducts,
				productId: customerProduct.product.id,
			}),
	);
	if (!sharedVolumeSeatPlan) return;

	throw new RecaseError({
		message: `Volume-priced seats can't be attached to more than one entity yet: their seats would share one Stripe price (plan: ${sharedVolumeSeatPlan.product.id}).`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
