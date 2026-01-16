import type Stripe from "stripe";

/**
 * Remove all payment methods from a Stripe customer.
 */
export const removeAllPaymentMethods = async ({
	stripeClient,
	stripeCustomerId,
}: {
	stripeClient: Stripe;
	stripeCustomerId: string;
}): Promise<void> => {
	const paymentMethods = await stripeClient.paymentMethods.list({
		customer: stripeCustomerId,
	});

	for (const pm of paymentMethods.data) {
		await stripeClient.paymentMethods.detach(pm.id);
	}
};
