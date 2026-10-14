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
