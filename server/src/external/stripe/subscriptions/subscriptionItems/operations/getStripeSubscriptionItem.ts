import type Stripe from "stripe";

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
		return null;
	}
};
