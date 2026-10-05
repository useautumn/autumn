import type { BillingContext, MultiAttachBillingContext } from "@autumn/shared";
import { setupAttachEndOfCycleMs } from "@/internal/billing/v2/actions/attach/setup/setupAttachEndOfCycleMs";

/** A requested anchor leaves the end-of-cycle boundary unresolved. */
export const setupSetPlansCycleBoundaryMs = ({
	billingContext,
	requestedBillingCycleAnchor,
}: {
	billingContext: MultiAttachBillingContext;
	requestedBillingCycleAnchor: BillingContext["requestedBillingCycleAnchor"];
}) => {
	if (requestedBillingCycleAnchor !== undefined) {
		return undefined;
	}

	return setupAttachEndOfCycleMs({
		planTiming: "end_of_cycle",
		stripeSubscription: billingContext.stripeSubscription,
		billingCycleAnchorMs: billingContext.billingCycleAnchorMs,
		currentEpochMs: billingContext.currentEpochMs,
	});
};
