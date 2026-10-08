import type { CreateScheduleBillingContext } from "@autumn/shared";
import { billingCycleAnchorToApply } from "../utils/billingCycleAnchorToApply";
import { endsLiveTrial } from "../utils/endsLiveTrial";
import { classifyFirstPhaseStart } from "./classifyFirstPhaseStart";
import {
	type LiveSubscriptionFields,
	replaceStripeSubscription,
} from "./replaceStripeSubscription";

/**
 * Ending a live trial now on a future anchor (the requested one, else the old trial end) recreates the subscription:
 * Stripe's update only anchors on now and invoices a full period when a trial ends, while a new one anchors on the date.
 */
export const replaceLiveSubscriptionForTrialEnd = ({
	billingContext,
}: {
	billingContext: Pick<
		CreateScheduleBillingContext,
		| "stripeSubscription"
		| "stripeSubscriptionSchedule"
		| "trialContext"
		| "replacedStripeSubscription"
		| "requestedBillingCycleAnchor"
		| "trialEndAnchorMs"
		| "currentEpochMs"
		| "immediatePhase"
	>;
}): LiveSubscriptionFields => {
	const { stripeSubscription, currentEpochMs } = billingContext;
	if (!stripeSubscription) return {};

	const anchorMs = billingCycleAnchorToApply({ billingContext });
	const anchorsInFuture =
		typeof anchorMs === "number" && anchorMs > currentEpochMs;
	const startsNow =
		classifyFirstPhaseStart({
			startsAt: billingContext.immediatePhase.starts_at,
			currentEpochMs,
		}) === "now";
	if (!endsLiveTrial({ billingContext }) || !anchorsInFuture || !startsNow) {
		return {};
	}

	return replaceStripeSubscription({
		stripeSubscription,
		stripeSubscriptionSchedule: billingContext.stripeSubscriptionSchedule,
	});
};
