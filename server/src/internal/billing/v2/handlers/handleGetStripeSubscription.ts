import { Scopes } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/** Reads a Stripe subscription live, so the dashboard sees its real collection method. */
export const handleGetStripeSubscription = createRoute({
	scopes: [Scopes.Billing.Read],
	handler: async (c) => {
		const { org, env } = c.get("ctx");
		const { stripe_subscription_id } = c.req.param();

		const stripeCli = createStripeCli({ org, env });
		const stripeSubscription = await stripeCli.subscriptions.retrieve(
			stripe_subscription_id,
		);

		return c.json(stripeSubscription);
	},
});
