import type { BillingContext, BillingPeriod } from "@autumn/shared";

/** `bill_difference` applies only to an existing subscription whose period runs on; a new
 * subscription's stub, or a cycle reset now, starts a new period, so it prorates. */
export const billingContextBillsDifference = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): boolean =>
	billingContext.requestedProrationBehavior === "bill_difference" &&
	billingContext.stripeSubscription !== undefined &&
	billingContext.requestedBillingCycleAnchor !== "now";

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
