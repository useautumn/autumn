import type {
	AttachParamsV1,
	BillingContext,
	BillingPlan,
} from "@autumn/shared";
import {
	DocsLinks,
	ErrCode,
	RecaseError,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";
import {
	billingPlanWillCharge,
	getChargeReasonMessage,
} from "@/internal/billing/v2/utils/billingPlan/billingPlanWillCharge";

/**
 * Validates that proration_behavior: 'none' is not used
 * in scenarios where deferring charges is invalid:
 * 1. Trial -> Non-trial transitions (removing a trial)
 * 2. Any operation that would result in a charge
 */
export const handleProrationBehaviorErrors = ({
	billingContext,
	billingPlan,
	params,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	params: UpdateSubscriptionV1Params | AttachParamsV1;
}) => {
	if (billingContext.requestedProrationBehavior !== "none") return;

	// When anchor reset + none is used, charges are expected (full new plan price)
	if (billingContext.requestedBillingCycleAnchor === "now") return;

	// Trial -> Non-trial transition (removing trial)
	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	if (isTrialing && !willBeTrialing) {
		throw new RecaseError({
			message:
				"Cannot set proration_behavior to 'none' when removing a free trial",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
			docsUrl: DocsLinks.Proration,
		});
	}

	const chargeResult = billingPlanWillCharge({ billingPlan });

	if (chargeResult.willCharge) {
		throw new RecaseError({
			message: `Cannot set proration_behavior to 'none' when ${getChargeReasonMessage(chargeResult.reason)}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
			docsUrl: DocsLinks.Proration,
		});
	}
};
