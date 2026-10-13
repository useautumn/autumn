import type { BillingContext } from "@autumn/shared";
import { billingContextToFutureTrialEnd } from "@/internal/billing/v2/utils/billingContext/billingContextToFutureTrialEnd";

/**
 * The future anchor a new subscription is created on. A trial ahead anchors on its own end
 * instead unless the anchor is after it, and an existing subscription resets via a schedule.
 */
export const billingContextToNewSubscriptionAnchorMs = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): number | undefined => {
	const { billingCycleAnchorMs, currentEpochMs, stripeSubscription } =
		billingContext;

	if (stripeSubscription) return undefined;
	if (typeof billingCycleAnchorMs !== "number") return undefined;
	if (billingCycleAnchorMs <= currentEpochMs) return undefined;
	const futureTrialEnd = billingContextToFutureTrialEnd({ billingContext });
	if (futureTrialEnd !== undefined && billingCycleAnchorMs <= futureTrialEnd) {
		return undefined;
	}

	return billingCycleAnchorMs;
};
