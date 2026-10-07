import type { CreateScheduleBillingContext } from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { classifyFirstPhaseStart } from "./classifyFirstPhaseStart";
import {
	type LiveSubscriptionFields,
	replaceStripeSubscription,
} from "./replaceStripeSubscription";

/**
 * Ending a live trial now on a future anchor recreates the subscription: Stripe's update only anchors on now
 * and invoices a full period when a trial ends, while a new subscription anchors on the date.
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
	const {
		stripeSubscription,
		trialContext,
		requestedBillingCycleAnchor,
		currentEpochMs,
	} = billingContext;
	if (!stripeSubscription) return {};

	const endsLiveTrial =
		isStripeSubscriptionTrialing(stripeSubscription) &&
		trialContext?.trialEndsAt === null;
	const anchorsInFuture =
		typeof requestedBillingCycleAnchor === "number" &&
		requestedBillingCycleAnchor > currentEpochMs;
	const startsNow =
		classifyFirstPhaseStart({
			startsAt: billingContext.immediatePhase.starts_at,
			currentEpochMs,
		}) === "now";
	if (!endsLiveTrial || !anchorsInFuture || !startsNow) return {};

	return replaceStripeSubscription({
		stripeSubscription,
		stripeSubscriptionSchedule: billingContext.stripeSubscriptionSchedule,
	});
};
