import type { BillingContext, BillingPeriod } from "@autumn/shared";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";

/** `bill_difference` applies only to an existing subscription whose period runs on; a new
 * subscription's stub, or a set_plans cycle reset now, starts a new period, so it prorates. */
export const billingContextBillsDifference = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): boolean =>
	billingContext.requestedProrationBehavior === "bill_difference" &&
	billingContext.stripeSubscription !== undefined &&
	!(
		isSetPlansBillingContext(billingContext) &&
		billingContext.requestedBillingCycleAnchor === "now"
	);

/** The instant proration is measured from: the period start when billing the full difference. */
export const billingContextToProrationNow = ({
	billingContext,
	billingPeriod,
	now,
}: {
	billingContext: BillingContext;
	billingPeriod?: BillingPeriod;
	now: number;
}): number => {
	if (!billingContextBillsDifference({ billingContext })) return now;
	return billingPeriod?.start ?? now;
};
