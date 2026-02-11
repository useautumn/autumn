import type {
	BillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import {
	ErrCode,
	isCustomerProductFree,
	isCustomerProductOneOff,
	RecaseError,
} from "@autumn/shared";
import {
	billingPlanWillCharge,
	getChargeReasonMessage,
} from "@/internal/billing/v2/utils/billingPlan/billingPlanWillCharge";

/**
 * Validates cancel: 'end_of_cycle' requests.
 * Throws error if trying to cancel a free or one-off product at end of cycle,
 * or if the billing plan would result in a charge.
 */
export const handleCancelEndOfCycleErrors = ({
	billingContext,
	billingPlan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
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

	// Block any operations that would result in a charge
	const chargeResult = billingPlanWillCharge({ billingPlan });

	if (chargeResult.willCharge) {
		throw new RecaseError({
			message: `Cannot use cancel: 'end_of_cycle' when ${getChargeReasonMessage(chargeResult.reason)}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
