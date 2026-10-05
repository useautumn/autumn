import type { StripeReplacedSubscriptionAction } from "@autumn/shared";
import type Stripe from "stripe";
import { isBackdateRecreate } from "./isBackdateRecreate";
import { replacedStripeScheduleId } from "./replacedStripeScheduleId";

const hasStripeSubscriptionEnded = (subscription: Stripe.Subscription) =>
	subscription.status === "canceled" ||
	subscription.status === "incomplete_expired";

/** Setup only moves a subscription into replacedStripeSubscription to cancel it; one that already ended needs nothing. */
export const buildReplacedSubscriptionAction = ({
	replacedStripeSubscription,
	subscriptionBackdateStartMs,
}: {
	replacedStripeSubscription?: Stripe.Subscription;
	subscriptionBackdateStartMs?: number;
}): StripeReplacedSubscriptionAction | undefined => {
	if (!replacedStripeSubscription) return undefined;
	if (hasStripeSubscriptionEnded(replacedStripeSubscription)) return undefined;

	const backdates = isBackdateRecreate({
		billingContext: { replacedStripeSubscription, subscriptionBackdateStartMs },
	});
	const stripeSubscriptionScheduleId = backdates
		? replacedStripeScheduleId({ replacedStripeSubscription })
		: undefined;
	return {
		type: "cancel",
		stripeSubscriptionId: replacedStripeSubscription.id,
		...(stripeSubscriptionScheduleId && { stripeSubscriptionScheduleId }),
		...(backdates && { reason: "backdate" as const }),
	};
};
