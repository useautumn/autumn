import type { BillingContext } from "@autumn/shared";
import { secondsToMs } from "@autumn/shared";

export const getCurrentBillingCycleAnchorMs = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) => {
	const { stripeSubscription } = billingContext;

	return stripeSubscription?.billing_cycle_anchor
		? secondsToMs(stripeSubscription.billing_cycle_anchor)
		: "now";
};
