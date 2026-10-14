import type Stripe from "stripe";
import type { createStripeCli } from "@/external/connect/createStripeCli";
import { autumnStripeRequestOptions } from "@/external/stripe/common/autumnStripeIdempotency";

export const createStripeSessionWithCardFallback = async ({
	stripeCli,
	params,
}: {
	stripeCli: ReturnType<typeof createStripeCli>;
	params: Stripe.Checkout.SessionCreateParams;
}) => {
	try {
		return await stripeCli.checkout.sessions.create(
			params,
			autumnStripeRequestOptions({ source: "checkout.session" }),
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : undefined;

		if (msg?.includes("payment method") || msg?.includes("No valid payment")) {
			return stripeCli.checkout.sessions.create(
				{
					...params,
					payment_method_types: ["card"],
				},
				autumnStripeRequestOptions({ source: "checkout.session" }),
			);
		}

		throw error;
	}
};
