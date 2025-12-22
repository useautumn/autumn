import type Stripe from "stripe";
import { stripeSubscriptionItemToStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/convertStripeSubscriptionItemUtils";

export const findStripeSubscriptionItemByStripePriceId = ({
	stripePriceId,
	stripeSubscriptionItems,
}: {
	stripePriceId: string;
	stripeSubscriptionItems: Stripe.SubscriptionItem[];
}) => {
	return stripeSubscriptionItems.find(
		(item) => stripeSubscriptionItemToStripePriceId(item) === stripePriceId,
	);
};
