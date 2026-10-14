import type { BillingContext, BillingPlan } from "@autumn/shared";
import { ErrCode, RecaseError } from "@autumn/shared";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";
import {
	billingPlanWillCharge,
	getChargeReasonMessage,
} from "@/internal/billing/v2/utils/billingPlan/billingPlanWillCharge";

export const handleProrationBehaviorErrors = ({
	billingContext,
	billingPlan,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	if (billingContext.requestedProrationBehavior !== "none") return;

	if (billingContext.requestedBillingCycleAnchor === "now") return;

	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});
	const endsTrial = isTrialing && !willBeTrialing;
	if (endsTrial && billingContext.prorationOverride === "bills_full_period") {
		return;
	}

	if (endsTrial) {
		throw new RecaseError({
			message:
				"Cannot set proration_behavior to 'none' when removing a free trial",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const chargeResult = billingPlanWillCharge({ billingPlan });

	if (chargeResult.reason === "subscription_create") return;

	if (chargeResult.willCharge) {
		throw new RecaseError({
			message: `Cannot set proration_behavior to 'none' when ${getChargeReasonMessage(chargeResult.reason)}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
