import type { SetPlansPreviewWarning } from "@autumn/shared";
import type Stripe from "stripe";

export type SubscriptionState =
	| Stripe.Subscription.Status
	| "none"
	| "checkout_session";

export type SubscriptionStateDecision = {
	action: "update" | "create" | "cancel_and_create";
	warning: Extract<
		SetPlansPreviewWarning["type"],
		"subscription_replaced" | "new_stripe_subscription"
	> | null;
};

const UPDATE: SubscriptionStateDecision = { action: "update", warning: null };
const CREATE_NEW_SUBSCRIPTION: SubscriptionStateDecision = {
	action: "create",
	warning: "new_stripe_subscription",
};
const CANCEL_AND_CREATE: SubscriptionStateDecision = {
	action: "cancel_and_create",
	warning: "subscription_replaced",
};

/** Stripe won't collect on incomplete, unpaid or paused subscriptions, so set_plans replaces them. */
const SUBSCRIPTION_STATE_DECISIONS: Record<
	SubscriptionState,
	SubscriptionStateDecision
> = {
	none: CREATE_NEW_SUBSCRIPTION,
	active: UPDATE,
	trialing: UPDATE,
	past_due: UPDATE,
	canceled: CREATE_NEW_SUBSCRIPTION,
	incomplete_expired: CREATE_NEW_SUBSCRIPTION,
	incomplete: CANCEL_AND_CREATE,
	unpaid: CANCEL_AND_CREATE,
	paused: CANCEL_AND_CREATE,
	checkout_session: CANCEL_AND_CREATE,
};

export const subscriptionStateAction = ({
	state,
}: {
	state: SubscriptionState;
}): SubscriptionStateDecision => SUBSCRIPTION_STATE_DECISIONS[state];
