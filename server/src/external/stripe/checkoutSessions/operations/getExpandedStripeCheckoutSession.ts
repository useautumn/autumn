import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const getStripeCheckoutSession = async ({
	ctx,
	checkoutSessionId,
}: {
	ctx: AutumnContext;
	checkoutSessionId: string;
}): Promise<Stripe.Checkout.Session> => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	return stripeCli.checkout.sessions.retrieve(checkoutSessionId);
};
