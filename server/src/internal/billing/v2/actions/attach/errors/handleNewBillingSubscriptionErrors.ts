import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	hasActivePaidSubscription,
	isCustomerProductFree,
	isProductPaidAndRecurring,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/**
 * Validates new_billing_subscription behavior for attach operations.
 */
export const handleNewBillingSubscriptionErrors = ({
	billingContext,
	params,
}: {
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}) => {
	const { fullCustomer, currentCustomerProduct, attachProduct } =
		billingContext;

	const isAttachPaidRecurring = isProductPaidAndRecurring(attachProduct);

	const hasPaidRecurringSubscription = hasActivePaidSubscription({
		customerProducts: fullCustomer.customer_products,
	});

	const isTransitionFromFree =
		!!currentCustomerProduct && isCustomerProductFree(currentCustomerProduct);

	// Only respect new_billing_subscription for non-transition scenarios
	// (add-ons, entity products). Upgrades/downgrades ignore the flag.
	const shouldForceNewSubscription =
		(!currentCustomerProduct && params.new_billing_subscription) ||
		(Boolean(params.new_billing_subscription) &&
			isAttachPaidRecurring &&
			isTransitionFromFree &&
			hasPaidRecurringSubscription);

	const requirePaidSubscriptionTarget =
		isAttachPaidRecurring && !shouldForceNewSubscription;

	if (
		params.new_billing_subscription === false &&
		requirePaidSubscriptionTarget &&
		!hasPaidRecurringSubscription
	) {
		throw new RecaseError({
			message:
				"Cannot merge with an existing billing cycle because the customer has no active paid recurring subscription. Set new_billing_subscription to true to create a new cycle.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
