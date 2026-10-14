import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import {
	cp,
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
} from "@autumn/shared";

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
