import { notNullish } from "@autumn/shared";
import type Stripe from "stripe";

/** Stripe subscription that is trialing with guaranteed trial_end */
export type TrialingStripeSubscription = Stripe.Subscription & {
	status: "trialing";
	trial_end: number;
};

/**
 * Checks if a Stripe subscription is in the trialing status.
 * Type guard that narrows to TrialingStripeSubscription with defined trial_end.
 */
export const isStripeSubscriptionTrialing = (
	stripeSubscription?: Stripe.Subscription,
): stripeSubscription is TrialingStripeSubscription => {
	if (!stripeSubscription) {
		return false;
	}

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

/**
 * Checks if a Stripe subscription is in the canceled status.
 * @param stripeSubscription - The Stripe subscription to check.
 * @returns True if the subscription is in the canceled status, false otherwise.
 */
export const isStripeSubscriptionCanceled = (
	stripeSubscription?: Stripe.Subscription,
) => {
	if (!stripeSubscription) {
		return false;
	}

	return stripeSubscription.status === "canceled";
};

/**
 * Checks if a Stripe subscription has any metered price items.
 */
export const stripeSubscriptionHasMeteredItems = (
	stripeSubscription?: Stripe.Subscription,
) => {
	if (!stripeSubscription) {
		return false;
	}

	return stripeSubscription.items.data.some(
		(item) => item.price.recurring?.usage_type === "metered",
	);
};

export const isStripeSubscriptionVercel = (
	stripeSubscription?: Stripe.Subscription,
) => {
	if (!stripeSubscription) {
		return false;
	}

	return Boolean(stripeSubscription.metadata?.vercel_installation_id);
};
