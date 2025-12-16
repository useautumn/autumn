import type Stripe from "stripe";
import { createStripeCli } from "../../../../external/connect/createStripeCli";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { notNullish } from "../../../../utils/genUtils";
import type { StripeCheckoutAction } from "../types";

export const executeStripeCheckoutAction = async ({
	ctx,
	stripeCheckoutAction,
}: {
	ctx: AutumnContext;
	stripeCheckoutAction: StripeCheckoutAction;
}) => {
	const { org, env, logger } = ctx;
	const { params } = stripeCheckoutAction;
	const stripeCli = createStripeCli({ org, env });

	const paymentMethodSet =
		notNullish(params?.payment_method_types) ||
		notNullish(params?.payment_method_configuration);

	let checkout: Stripe.Checkout.Session;
	try {
		const checkout = await stripeCli.checkout.sessions.create(params);
		logger.info(`✅ Successfully created checkout session`);
		return checkout;
	} catch (error) {
		const msg = error instanceof Error ? error.message : undefined;
		if (msg?.includes("No valid payment method types") && !paymentMethodSet) {
			checkout = await stripeCli.checkout.sessions.create({
				...params,
				payment_method_types: ["card"],
			});

			logger.info(`✅ Created fallback checkout session with pmc`);
			return checkout;
		} else {
			throw error;
		}
	}
};
