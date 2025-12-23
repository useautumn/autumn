import { notNullish } from "@autumn/shared";
import type Stripe from "stripe";

export const isStripeSubscriptionTrialing = (
	stripeSubscription: Stripe.Subscription,
) => {
	return stripeSubscription.status === "trialing";
};

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
