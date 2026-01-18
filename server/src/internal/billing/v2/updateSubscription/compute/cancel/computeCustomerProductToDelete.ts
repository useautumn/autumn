import {
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
} from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";

/**
 * Finds an existing scheduled customer product in the same group to delete.
 * This handles the case where there's already a downgrade scheduled.
 */
export const computeCustomerProductToDelete = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}): FullCusProduct | undefined => {
	const { fullCustomer, customerProduct } = billingContext;

	if (customerProduct.product.is_add_on) return undefined;

	return findMainScheduledCustomerProductByGroup({
		fullCustomer,
		productGroup: customerProduct.product.group,
		internalEntityId: customerProduct.internal_entity_id,
	});
};
