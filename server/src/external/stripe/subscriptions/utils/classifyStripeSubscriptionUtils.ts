import { notNullish } from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Checks if a Stripe subscription is in the trialing status.
 * @param stripeSubscription - The Stripe subscription to check.
 * @returns True if the subscription is in the trialing status, false otherwise.
 */
export const isStripeSubscriptionTrialing = (
	stripeSubscription: Stripe.Subscription,
) => {
	return stripeSubscription.status === "trialing";
};

/**
 * Checks if a Stripe subscription is in the canceling status.
 * @param stripeSubscription - The Stripe subscription to check.
 * @returns True if the subscription is in the canceling status, false otherwise.
 */
export const isStripeSubscriptionCanceling = (
	stripeSubscription?: Stripe.Subscription,
) => {
	if (!stripeSubscription) {
		return false;
	}

	return (
		notNullish(stripeSubscription.canceled_at) ||
		notNullish(stripeSubscription.cancel_at) ||
		stripeSubscription.cancel_at_period_end
	);
};

export const isStripeSubscriptionCanceled = (
	stripeSubscription?: Stripe.Subscription,
) => {
	if (!stripeSubscription) {
		return false;
	}

	return stripeSubscription.status === "canceled";
};
