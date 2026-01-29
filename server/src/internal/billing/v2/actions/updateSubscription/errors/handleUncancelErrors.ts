import { CusProductStatus, RecaseError } from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@autumn/shared";

/**
 * Validates uncancel operation and throws appropriate errors.
 * - Cannot uncancel a scheduled product
 * - Cannot uncancel an expired product
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

	const { customerProduct } = billingContext;

	if (customerProduct.status === CusProductStatus.Scheduled) {
		throw new RecaseError({
			message: "Cannot uncancel a scheduled product",
		});
	}

	if (customerProduct.status === CusProductStatus.Expired) {
		throw new RecaseError({
			message: "Cannot uncancel an expired product",
		});
	}

	// If product is not canceling, this is a no-op - not an error
	// The compute layer will handle it gracefully
};
