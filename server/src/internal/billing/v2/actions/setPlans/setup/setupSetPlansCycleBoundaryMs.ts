import type {
	MultiAttachBillingContext,
	SetPlansParamsV0,
} from "@autumn/shared";
import { setupAttachEndOfCycleMs } from "@/internal/billing/v2/actions/attach/setup/setupAttachEndOfCycleMs";

/** Where an end-of-cycle phase starts; a requested anchor leaves it unresolved. */
export const setupSetPlansCycleBoundaryMs = ({
	billingContext,
	params,
}: {
	billingContext: MultiAttachBillingContext;
	params: SetPlansParamsV0;
}) => {
	if (params.billing_cycle_anchor !== undefined) {
		return undefined;
	}

	return setupAttachEndOfCycleMs({
		planTiming: "end_of_cycle",
		stripeSubscription: billingContext.stripeSubscription,
		billingCycleAnchorMs: billingContext.billingCycleAnchorMs,
		currentEpochMs: billingContext.currentEpochMs,
	});
};
