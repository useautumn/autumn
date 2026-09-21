import type Stripe from "stripe";

const STRIPE_LIST_PAGE_SIZE = 100;

/** One org-wide listing replaces a Stripe call per customer, keeping a bulk
 * audit off the org's own rate limit. */
export const sweepStripeSubscriptions = async ({
	stripeCli,
}: {
	stripeCli: Stripe;
}): Promise<Map<string, Stripe.Subscription[]>> => {
	const subscriptionsByStripeCustomerId = new Map<
		string,
		Stripe.Subscription[]
	>();

	const subscriptions = stripeCli.subscriptions.list({
		limit: STRIPE_LIST_PAGE_SIZE,
	});
	for await (const subscription of subscriptions) {
		const stripeCustomerId =
			typeof subscription.customer === "string"
				? subscription.customer
				: subscription.customer.id;
		const existing = subscriptionsByStripeCustomerId.get(stripeCustomerId);
		if (existing) existing.push(subscription);
		else subscriptionsByStripeCustomerId.set(stripeCustomerId, [subscription]);
	}

	return subscriptionsByStripeCustomerId;
};
