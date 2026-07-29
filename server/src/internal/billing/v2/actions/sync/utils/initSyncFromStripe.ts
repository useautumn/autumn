import { getCycleEnd } from "@autumn/shared";
import type Stripe from "stripe";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { stripeSubscriptionToLargestInterval } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";

const secondsToMs = (seconds: number) => seconds * 1000;

/** Period end from the billing anchor + the sub's largest item interval — the
 * boundary a canceling sub terminates on when Stripe supplies no end date. */
const getAnchorPeriodEndMs = ({
	stripeSubscription,
}: {
	stripeSubscription: Stripe.Subscription;
}): number | undefined => {
	const largest = stripeSubscriptionToLargestInterval({ stripeSubscription });
	if (!largest) return undefined;

	return getCycleEnd({
		anchor: secondsToMs(stripeSubscription.billing_cycle_anchor),
		interval: largest.interval,
		intervalCount: largest.intervalCount,
		now: Date.now(),
	});
};

/** Inherit trialEndsAt from the Stripe subscription if trialing. */
export const getTrialEndsAtFromStripe = ({
	stripeSubscription,
}: {
	stripeSubscription: Stripe.Subscription;
}): number | undefined => {
	if (!stripeSubscription.trial_end) return undefined;
	return secondsToMs(stripeSubscription.trial_end);
};

/** Derive cancel/end timestamps from the Stripe subscription. */
export const getCancelFieldsFromStripe = ({
	stripeSubscription,
}: {
	stripeSubscription: Stripe.Subscription;
}): { canceledAt?: number; endedAt?: number } => {
	if (!isStripeSubscriptionCanceling(stripeSubscription)) {
		return {};
	}

	const canceledAt = stripeSubscription.canceled_at
		? secondsToMs(stripeSubscription.canceled_at)
		: Date.now();

	let endedAt: number | undefined;

	if (stripeSubscription.ended_at) {
		endedAt = secondsToMs(stripeSubscription.ended_at);
	} else if (stripeSubscription.cancel_at) {
		endedAt = secondsToMs(stripeSubscription.cancel_at);
	} else {
		endedAt = getAnchorPeriodEndMs({ stripeSubscription });
	}

	return { canceledAt, endedAt };
};
