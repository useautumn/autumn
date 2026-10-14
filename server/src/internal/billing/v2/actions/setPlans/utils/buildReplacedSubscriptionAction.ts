import type { StripeReplacedSubscriptionAction } from "@autumn/shared";
import type Stripe from "stripe";
import { isBackdateRecreate } from "./isBackdateRecreate";

const hasStripeSubscriptionEnded = (subscription: Stripe.Subscription) =>
	subscription.status === "canceled" ||
	subscription.status === "incomplete_expired";

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
	return {
		type: "cancel",
		stripeSubscriptionId: replacedStripeSubscription.id,
		...(backdates && { reason: "backdate" as const }),
	};
};
