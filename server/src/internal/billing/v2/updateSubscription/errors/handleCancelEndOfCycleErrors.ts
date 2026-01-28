import {
	isCustomerProductFree,
	isCustomerProductOneOff,
	RecaseError,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";

/**
 * Validates cancel: 'end_of_cycle' requests.
 * Throws error if trying to cancel a free or one-off product at end of cycle.
 */
export const handleCancelEndOfCycleErrors = ({
	billingContext,
	params,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV0Params;
}) => {
	if (billingContext.cancelAction !== "cancel_end_of_cycle") return;

	const { customerProduct } = billingContext;

	if (isCustomerProductFree(customerProduct)) {
		throw new RecaseError({
			message:
				"Cannot use cancel: 'end_of_cycle' for free products. Use cancel: 'immediately' instead.",
		});
	}

	if (isCustomerProductOneOff(customerProduct)) {
		throw new RecaseError({
			message:
				"Cannot use cancel: 'end_of_cycle' for one-off products. Use cancel: 'immediately' instead.",
		});
	}
};
