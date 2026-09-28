import type { BillingContext, BillingPeriod } from "@autumn/shared";

/** The instant proration is measured from. `bill_difference` measures from the
 * period start, so charges and credits cover the full period. */
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
	return billingPeriod?.start ?? now;
};
