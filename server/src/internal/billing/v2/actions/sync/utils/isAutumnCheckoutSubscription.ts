import type Stripe from "stripe";

/**
 * True when `subscription` was created by an Autumn-managed Checkout Session.
 *
 * Why: `checkout.session.completed` materializes the cus_product itself, so
 * auto-sync from `customer.subscription.created` would race and produce a
 * duplicate row on the same Stripe sub.
 */
export const isAutumnCheckoutSubscription = async ({
	stripeCli,
	subscription,
}: {
	stripeCli: Stripe;
	subscription: Stripe.Subscription;
}): Promise<boolean> => {
	const sessions = await stripeCli.checkout.sessions.list({
		subscription: subscription.id,
		limit: 1,
	});
	const session = sessions.data[0];
	return Boolean(session?.metadata?.autumn_metadata_id);
};
