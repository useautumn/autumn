import type Stripe from "stripe";
import { stripeSubscriptionItemToStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/convertStripeSubscriptionItemUtils";

/**
 * Finds a Stripe subscription item by its Stripe price ID.
 * @param stripePriceId - The Stripe price ID to search for.
 * @param stripeSubscriptionItems - The Stripe subscription items to search through.
 * @returns The Stripe subscription item, or undefined if no match is found.
 */
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
