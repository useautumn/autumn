import {
	isCustomerProductExpired,
	isCustomerProductScheduled,
	RecaseError,
} from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@autumn/shared";

export const handleCurrentCustomerProductErrors = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	const { customerProduct } = billingContext;

	if (isCustomerProductScheduled(customerProduct)) {
		throw new RecaseError({
			message: `Cannot update subscription for '${customerProduct.product.name}' because it is scheduled and not yet active`,
		});
	}

	if (isCustomerProductExpired(customerProduct)) {
		throw new RecaseError({
			message: `Cannot update subscription for '${customerProduct.product.name}' because it has expired`,
		});
	}
};
