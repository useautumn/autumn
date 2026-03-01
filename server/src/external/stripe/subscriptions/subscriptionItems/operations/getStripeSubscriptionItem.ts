import type Stripe from "stripe";

/**
 * Retrieves a Stripe subscription item by ID.
 * Returns null if the subscription item doesn't exist or has been deleted.
 */
export const getStripeSubscriptionItem = async ({
	stripeCli,
	subscriptionItemId,
}: {
	stripeCli: Stripe;
	subscriptionItemId: string;
}): Promise<Stripe.SubscriptionItem | null> => {
	try {
		return await stripeCli.subscriptionItems.retrieve(subscriptionItemId);
	} catch {
		// Subscription item may have been deleted - return null
		return null;
	}
};
