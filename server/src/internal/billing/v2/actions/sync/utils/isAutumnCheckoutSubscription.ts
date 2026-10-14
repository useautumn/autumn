import type Stripe from "stripe";

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
