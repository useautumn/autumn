import type { CreateScheduleBillingContext } from "@autumn/shared";
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
		| "requestedBillingCycleAnchor"
		| "currentEpochMs"
		| "immediatePhase"
	>;
}): LiveSubscriptionFields => {
	const { stripeSubscription, requestedBillingCycleAnchor, currentEpochMs } =
		billingContext;
	if (!stripeSubscription) return {};

	const anchorsInFuture =
		typeof requestedBillingCycleAnchor === "number" &&
		requestedBillingCycleAnchor > currentEpochMs;
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
