import type Stripe from "stripe";
import { subscriptionStateAction } from "../utils/subscriptionStateAction";

export const scheduleSubscriptionId = (
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule,
) => {
	const subscription = stripeSubscriptionSchedule?.subscription;
	return typeof subscription === "string" ? subscription : subscription?.id;
};

const replacesSubscription = ({
	subscription,
	backdatesFirstPhase,
}: {
	subscription: Stripe.Subscription;
	backdatesFirstPhase?: boolean;
}) =>
	subscriptionStateAction({ state: subscription.status, backdatesFirstPhase })
		.action !== "update";

/** Moves a subscription set_plans won't update aside, so a new one is created in its place. */
export const splitReplacedStripeSubscription = ({
	stripeSubscription,
	stripeSubscriptionSchedule,
	canceledStripeSubscription,
	pendingStripeSubscription,
	backdatesFirstPhase,
}: {
	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	canceledStripeSubscription?: Stripe.Subscription;
	pendingStripeSubscription?: Stripe.Subscription;
	backdatesFirstPhase?: boolean;
}) => {
	const pendingReplacement =
		pendingStripeSubscription &&
		replacesSubscription({ subscription: pendingStripeSubscription })
			? pendingStripeSubscription
			: undefined;
	const candidate =
		stripeSubscription ?? canceledStripeSubscription ?? pendingReplacement;

	if (
		!candidate ||
		!replacesSubscription({ subscription: candidate, backdatesFirstPhase })
	) {
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
