import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import {
	DocsLinks,
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

	if (
		isCustomerProductScheduled(customerProduct) &&
		!billingContext.cancelAction
	) {
		throw new RecaseError({
			message: `Subscription for '${customerProduct.product.name}' is scheduled and cannot be updated until it becomes active`,
			statusCode: 400,
			docsUrl: DocsLinks.SubscriptionLifecycle,
		});
	}

	if (isCustomerProductExpired(customerProduct)) {
		throw new RecaseError({
			message: `Subscription for '${customerProduct.product.name}' has expired and cannot be updated`,
			statusCode: 400,
			docsUrl: DocsLinks.SubscriptionLifecycle,
		});
	}
};
