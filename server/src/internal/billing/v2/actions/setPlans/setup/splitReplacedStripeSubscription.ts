import type Stripe from "stripe";
import { subscriptionStateAction } from "../utils/subscriptionStateAction";

export const scheduleSubscriptionId = (
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule,
) => {
	const subscription = stripeSubscriptionSchedule?.subscription;
	return typeof subscription === "string" ? subscription : subscription?.id;
};

const replacesSubscription = (subscription: Stripe.Subscription) =>
	subscriptionStateAction({ state: subscription.status }).action !== "update";

/** Moves a subscription set_plans won't update aside, so a new one is created in its place. */
export const splitReplacedStripeSubscription = ({
	stripeSubscription,
	stripeSubscriptionSchedule,
	canceledStripeSubscription,
	pendingStripeSubscription,
}: {
	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	canceledStripeSubscription?: Stripe.Subscription;
	pendingStripeSubscription?: Stripe.Subscription;
}) => {
	const pendingReplacement =
		pendingStripeSubscription && replacesSubscription(pendingStripeSubscription)
			? pendingStripeSubscription
			: undefined;
	const candidate =
		stripeSubscription ?? canceledStripeSubscription ?? pendingReplacement;

	if (!candidate || !replacesSubscription(candidate)) {
		return {
			stripeSubscription,
			stripeSubscriptionSchedule,
			replacedStripeSubscription: undefined,
		};
	}

	const scheduleBelongsToReplaced =
		scheduleSubscriptionId(stripeSubscriptionSchedule) === candidate.id;

	return {
		stripeSubscription: undefined,
		stripeSubscriptionSchedule: scheduleBelongsToReplaced
			? undefined
			: stripeSubscriptionSchedule,
		replacedStripeSubscription: candidate,
	};
};
