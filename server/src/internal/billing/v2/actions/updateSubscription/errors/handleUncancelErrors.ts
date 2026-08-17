import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import { CusProductStatus, RecaseError } from "@autumn/shared";

/**
 * Validates uncancel operation and throws appropriate errors.
 * - Cannot uncancel a scheduled product
 * - Cannot uncancel an expired product
 * - Cannot uncancel onto a subscription Stripe has already canceled
 * - Uncanceling an already active (non-canceling) product is a no-op (not an error)
 */
export const handleUncancelErrors = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	if (billingContext.cancelAction !== "uncancel") {
		return;
	}

	const { customerProduct, canceledStripeSubscriptionId } = billingContext;

	if (customerProduct.status === CusProductStatus.Scheduled) {
		throw new RecaseError({
			message: "Cannot uncancel a subscription that is scheduled",
			statusCode: 400,
		});
	}

	if (customerProduct.status === CusProductStatus.Expired) {
		throw new RecaseError({
			message: "Cannot uncancel a subscription that has expired",
			statusCode: 400,
		});
	}

	// There is no subscription left to resume, so the plan would come back
	// active and permanently unbilled.
	if (canceledStripeSubscriptionId) {
		throw new RecaseError({
			message: `Subscription ${canceledStripeSubscriptionId} is already canceled in Stripe and cannot be uncanceled; attach the plan again to start a new subscription.`,
			statusCode: 400,
		});
	}

	// If product is not canceling, this is a no-op - not an error
	// The compute layer will handle it gracefully
};
