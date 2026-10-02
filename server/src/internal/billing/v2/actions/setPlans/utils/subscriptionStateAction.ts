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
		| "subscription_replaced"
		| "new_stripe_subscription"
		| "subscription_recreated_backdated"
	> | null;
	reason?: "backdate";
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

const BACKDATE_RECREATE: SubscriptionStateDecision = {
	action: "cancel_and_create",
	warning: "subscription_recreated_backdated",
	reason: "backdate",
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

/** A subscription set_plans would update can't take a backdated start, so it is recreated from it instead. */
export const subscriptionStateAction = ({
	state,
	backdatesFirstPhase = false,
}: {
	state: SubscriptionState;
	backdatesFirstPhase?: boolean;
}): SubscriptionStateDecision => {
	const decision = SUBSCRIPTION_STATE_DECISIONS[state];
	return backdatesFirstPhase && decision.action === "update"
		? BACKDATE_RECREATE
		: decision;
};
