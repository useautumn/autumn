import type { BillingContext, BillingPeriod } from "@autumn/shared";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";

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
