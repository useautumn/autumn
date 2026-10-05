import type { BillingContext } from "@autumn/shared";
import { secondsToMs } from "@autumn/shared";
import { isBackdateRecreate } from "@/internal/billing/v2/actions/setPlans/utils/isBackdateRecreate";

export const getCurrentBillingCycleAnchorMs = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) => {
	const currentSubscription = isBackdateRecreate({ billingContext })
		? billingContext.replacedStripeSubscription
		: billingContext.stripeSubscription;

	return currentSubscription?.billing_cycle_anchor
		? secondsToMs(currentSubscription.billing_cycle_anchor)
		: "now";
};
