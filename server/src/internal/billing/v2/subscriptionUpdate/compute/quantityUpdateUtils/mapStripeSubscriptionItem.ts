import type { Price } from "@autumn/shared";
import type Stripe from "stripe";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils";

/**
 * Maps a price to its corresponding Stripe subscription item, if one exists.
 *
 * Finds subscription item by matching stripe_price_id.
 * Returns undefined if price hasn't been added to subscription yet.
 *
 * @param price - Price configuration to find subscription item for
 * @param stripeSubscription - Stripe subscription containing subscription items
 * @returns Matching Stripe subscription item, or undefined if no match
 */
export const mapStripeSubscriptionItem = ({
	price,
	stripeSubscription,
}: {
	price: Price;
	stripeSubscription: Stripe.Subscription;
}): Stripe.SubscriptionItem | undefined => {
	return findStripeItemForPrice({
		price,
		stripeItems: stripeSubscription.items.data,
	}) as Stripe.SubscriptionItem | undefined;
};
