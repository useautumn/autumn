import type { CreateScheduleBillingContext } from "@autumn/shared";

/** The anchor the new cycle takes: the requested one, else the old trial end a trial ended now or backdated anchors on. */
export const billingCycleAnchorToApply = ({
	billingContext,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		"requestedBillingCycleAnchor" | "trialEndAnchorMs"
	>;
}) =>
	billingContext.requestedBillingCycleAnchor ?? billingContext.trialEndAnchorMs;
