import type Stripe from "stripe";
import type { createStripeCli } from "@/external/connect/createStripeCli";

/**
 * Creates a Stripe checkout session, retrying with explicit `payment_method_types: ["card"]`
 * if Stripe rejects automatic payment method determination.
 */
export const createStripeSessionWithCardFallback = async ({
	stripeCli,
	params,
}: {
	stripeCli: ReturnType<typeof createStripeCli>;
	params: Stripe.Checkout.SessionCreateParams;
}) => {
	try {
		return await stripeCli.checkout.sessions.create(params);
	} catch (error) {
		const msg = error instanceof Error ? error.message : undefined;

		if (msg?.includes("payment method") || msg?.includes("No valid payment")) {
			return stripeCli.checkout.sessions.create({
				...params,
				payment_method_types: ["card"],
			});
		}

		throw error;
	}
};
