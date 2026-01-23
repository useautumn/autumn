import { notNullish } from "@autumn/shared";
import type Stripe from "stripe";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";

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

/**
 * Checks if a Stripe subscription was canceled immediately (not at end of period).
 *
 * For Stripe dashboard-initiated cancellations:
 * - "Cancel at end of period" → cancel_at_period_end = true → returns false
 * - "Cancel immediately" → cancel_at_period_end = false → returns true
 *
 * Note: This is only reliable for external (non-Autumn) cancellations.
 * Autumn-initiated cancellations use a lock mechanism and are filtered out
 * before this check in the subscription.deleted handler.
 */
export const wasImmediateStripeCancellation = (
	stripeSubscription?: Stripe.Subscription,
): boolean => {
	if (!stripeSubscription) return false;

	if (!stripeSubscription.ended_at) return false;

	const latestPeriodEnd = getLatestPeriodEnd({ sub: stripeSubscription });
	const differenceInSeconds = Math.abs(
		stripeSubscription.ended_at - latestPeriodEnd,
	);

	return differenceInSeconds > 20;

	// // If cancel_at_period_end is true, it was an end-of-period cancellation
	// // If false, it was an immediate cancellation
	// return !stripeSubscription.cancel_at_period_end;
};
