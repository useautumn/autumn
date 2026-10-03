import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import { scheduleSubscriptionId } from "./splitReplacedStripeSubscription";

export type LiveSubscriptionFields = Partial<
	Pick<
		BillingContext,
		| "stripeSubscription"
		| "stripeSubscriptionSchedule"
		| "replacedStripeSubscription"
	>
>;

/** Moves the live subscription aside to be cancelled and recreated; only its own schedule goes with it. */
export const replaceStripeSubscription = ({
	stripeSubscription,
	stripeSubscriptionSchedule,
}: {
	stripeSubscription: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
}): LiveSubscriptionFields => {
	const scheduleBelongsToReplaced =
		scheduleSubscriptionId(stripeSubscriptionSchedule) ===
		stripeSubscription.id;

	return {
		stripeSubscription: undefined,
		stripeSubscriptionSchedule: scheduleBelongsToReplaced
			? undefined
			: stripeSubscriptionSchedule,
		replacedStripeSubscription: stripeSubscription,
	};
};
