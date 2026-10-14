import type { CreateScheduleBillingContext } from "@autumn/shared";

export const billingCycleAnchorToApply = ({
	billingContext,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		"requestedBillingCycleAnchor" | "trialEndAnchorMs"
	>;
}) =>
	billingContext.requestedBillingCycleAnchor ?? billingContext.trialEndAnchorMs;
