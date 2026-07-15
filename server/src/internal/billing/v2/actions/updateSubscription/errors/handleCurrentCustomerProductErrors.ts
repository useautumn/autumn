import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import {
	isCustomerProductExpired,
	isCustomerProductScheduled,
	RecaseError,
} from "@autumn/shared";

export const handleCurrentCustomerProductErrors = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	const { customerProduct } = billingContext;

	// A scheduled product can't take Stripe billing changes until it's active,
	// but an update that touches no billing (no_billing_changes, no billing
	// fields) has nothing to defer, so let it through.
	if (
		isCustomerProductScheduled(customerProduct) &&
		!billingContext.cancelAction &&
		!billingContext.skipBillingChanges
	) {
		throw new RecaseError({
			message: `Subscription for '${customerProduct.product.name}' is scheduled and cannot be updated until it becomes active`,
			statusCode: 400,
		});
	}

	if (isCustomerProductExpired(customerProduct)) {
		throw new RecaseError({
			message: `Subscription for '${customerProduct.product.name}' has expired and cannot be updated`,
			statusCode: 400,
		});
	}
};
