import {
	type FullCusProduct,
	isCustomerProductCanceling,
	isCustomerProductMain,
} from "@autumn/shared";
import type { FullCustomer } from "@shared/models/cusModels/fullCusModel";

/**
 * Computes the scheduled customer product to delete when updating a subscription.
 *
 * When a user updates a canceling subscription, the cancellation should be reversed
 * and any scheduled replacement product should be deleted.
 *
 * @returns The scheduled customer product to delete, or undefined if none exists
 */
export const computeDeleteCustomerProduct = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}): FullCusProduct | undefined => {
	// Only look for scheduled product if:
	// 1. Current product is main (not add-on)
	// 2. Current product is being canceled

	const isMain = isCustomerProductMain(customerProduct);
	const isCanceling = isCustomerProductCanceling(customerProduct);

	if (!isMain || !isCanceling) return undefined;

	// For now we won't change the cancelling state of the product in update subscription. To be changed when we add the cancelling / canceled fields to update subscription.
	return undefined;

	// return findMainScheduledCustomerProductByGroup({
	// 	fullCustomer,
	// 	productGroup: customerProduct.product.group,
	// });
};
