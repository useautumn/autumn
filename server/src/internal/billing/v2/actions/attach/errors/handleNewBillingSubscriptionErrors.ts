import {
	ACTIVE_STATUSES,
	type AttachBillingContext,
	type AttachParamsV1,
	CusProductStatus,
	cusProductToPrices,
	ErrCode,
	isFreeProduct,
	isOneOffProduct,
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

	const isAttachPaidRecurring =
		!isOneOffProduct({ prices: attachProduct.prices }) &&
		!isFreeProduct({ prices: attachProduct.prices });

	const hasPaidRecurringSubscription = fullCustomer.customer_products.some(
		(customerProduct) => {
			const hasActiveOrTrialingStatus =
				ACTIVE_STATUSES.includes(customerProduct.status) ||
				customerProduct.status === CusProductStatus.Trialing;

			if (!hasActiveOrTrialingStatus) return false;
			if (!customerProduct.subscription_ids?.length) return false;

			const prices = cusProductToPrices({
				cusProduct: customerProduct,
			});

			return !isOneOffProduct({ prices }) && !isFreeProduct({ prices });
		},
	);

	const isTransitionFromFree =
		!!currentCustomerProduct &&
		isFreeProduct({
			prices: cusProductToPrices({
				cusProduct: currentCustomerProduct,
			}),
		});

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
