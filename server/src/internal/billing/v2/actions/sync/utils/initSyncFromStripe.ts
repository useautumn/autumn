import type Stripe from "stripe";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

const secondsToMs = (seconds: number) => seconds * 1000;

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
	}

	return { canceledAt, endedAt };
};
