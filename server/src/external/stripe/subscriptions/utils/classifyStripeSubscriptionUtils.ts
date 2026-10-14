import { notNullish, secondsToMs } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import type Stripe from "stripe";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";

type TrialingStripeSubscription = Stripe.Subscription & {
	status: "trialing";
	trial_end: number;
};

export const isStripeSubscriptionTrialing = (
	stripeSubscription?: Stripe.Subscription,
): stripeSubscription is TrialingStripeSubscription => {
	if (!stripeSubscription) {
		return false;
	}

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

export const isStripeSubscriptionCanceled = (
	stripeSubscription?: Stripe.Subscription,
) => {
	if (!stripeSubscription) {
		return false;
	}

	return stripeSubscription.status === "canceled";
};

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
};

export const isStripeSubscriptionPastDue = (
	stripeSubscription?: Stripe.Subscription,
) => {
	if (!stripeSubscription) {
		return false;
	}

	return stripeSubscription.status === "past_due";
};

export const isStripeSubscriptionPastDueTransition = ({
	stripeSubscription,
	previousAttributes,
}: {
	stripeSubscription?: Stripe.Subscription;
	previousAttributes?: { status?: Stripe.Subscription.Status };
}) => {
	const statusChanged = !!previousAttributes && "status" in previousAttributes;
	return statusChanged && isStripeSubscriptionPastDue(stripeSubscription);
};

export const isStripeSubscriptionAnchoredToMonthStart = (
	stripeSubscription: Stripe.Subscription,
): boolean =>
	new UTCDate(
		secondsToMs(stripeSubscription.billing_cycle_anchor),
	).getUTCDate() === 1;
