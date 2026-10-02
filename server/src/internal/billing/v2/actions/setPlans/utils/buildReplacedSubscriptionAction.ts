import type { StripeReplacedSubscriptionAction } from "@autumn/shared";
import type Stripe from "stripe";

const hasStripeSubscriptionEnded = (subscription: Stripe.Subscription) =>
	subscription.status === "canceled" ||
	subscription.status === "incomplete_expired";

/** Setup only moves a subscription into replacedStripeSubscription to cancel it; one that already ended needs nothing. */
export const buildReplacedSubscriptionAction = ({
	replacedStripeSubscription,
}: {
	replacedStripeSubscription?: Stripe.Subscription;
}): StripeReplacedSubscriptionAction | undefined => {
	if (!replacedStripeSubscription) return undefined;
	if (hasStripeSubscriptionEnded(replacedStripeSubscription)) return undefined;

	return {
		type: "cancel",
		stripeSubscriptionId: replacedStripeSubscription.id,
	};
};
