import { secondsToMs } from "@autumn/shared";
import type { BillingContext } from "@autumn/shared";

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
