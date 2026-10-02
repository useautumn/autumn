import type { StripeReplacedSubscriptionAction } from "@autumn/shared";
import type Stripe from "stripe";
import { subscriptionStateAction } from "./subscriptionStateAction";

export const buildReplacedSubscriptionAction = ({
	replacedStripeSubscription,
}: {
	replacedStripeSubscription?: Stripe.Subscription;
}): StripeReplacedSubscriptionAction | undefined => {
	if (!replacedStripeSubscription) return undefined;

	const { action } = subscriptionStateAction({
		state: replacedStripeSubscription.status,
	});
	if (action === "create") return undefined;

	return {
		type: "cancel",
		stripeSubscriptionId: replacedStripeSubscription.id,
	};
};
