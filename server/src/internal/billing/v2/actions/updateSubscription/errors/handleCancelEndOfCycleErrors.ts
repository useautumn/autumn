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

export const handleCancelEndOfCycleErrors = ({
	billingContext,
	billingPlan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
}) => {
	if (billingContext.cancelAction !== "cancel_end_of_cycle") return;

	const { customerProduct, canceledStripeSubscriptionId } = billingContext;

	// The cycle it would cancel at the end of no longer exists, and Stripe will
	if (canceledStripeSubscriptionId) {
		throw new RecaseError({
			message: `Subscription ${canceledStripeSubscriptionId} is already canceled in Stripe; use cancel: 'cancel_immediately' instead.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (isCustomerProductFree(customerProduct)) {
		throw new RecaseError({
			message:
				"Free products do not have billing cycles; use cancel: 'immediately' instead.",
			statusCode: 400,
		});
	}

	if (isCustomerProductOneOff(customerProduct)) {
		throw new RecaseError({
			message:
				"One-off products do not have billing cycles; use cancel: 'immediately' instead.",
			statusCode: 400,
		});
	}

	const chargeResult = billingPlanWillCharge({ billingPlan });

	if (chargeResult.willCharge) {
		throw new RecaseError({
			message: `Cannot use cancel: 'end_of_cycle' when ${getChargeReasonMessage(chargeResult.reason)}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
