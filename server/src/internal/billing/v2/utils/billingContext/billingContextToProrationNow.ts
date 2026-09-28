import type { BillingContext, BillingPeriod } from "@autumn/shared";

/** The instant proration is measured from. `bill_difference` measures from the period
 * start on an existing subscription; a new subscription's stub still prorates. */
export const billingContextToProrationNow = ({
	billingContext,
	billingPeriod,
	now,
}: {
	billingContext: BillingContext;
	billingPeriod?: BillingPeriod;
	now: number;
}): number => {
	if (billingContext.requestedProrationBehavior !== "bill_difference")
		return now;
	if (!billingContext.stripeSubscription) return now;
	return billingPeriod?.start ?? now;
};
