import {
	cp,
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
} from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@autumn/shared";

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

	const { valid: isMainRecurring } = cp(customerProduct).main().recurring();

	if (!isMainRecurring) return undefined;

	return findMainScheduledCustomerProductByGroup({
		fullCustomer,
		productGroup: customerProduct.product.group,
		internalEntityId: customerProduct.internal_entity_id,
	});
};
