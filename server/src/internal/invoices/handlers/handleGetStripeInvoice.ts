import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * Get Stripe invoice by Stripe invoice ID
 * Requires authentication via secret key middleware
 */
export const handleGetStripeInvoice = createRoute({
	handler: async (c) => {
		const { org, env } = c.get("ctx");
		const { stripe_invoice_id } = c.req.param();

		const stripeCli = createStripeCli({
			org,
			env,
		});

		const stripeInvoice = await stripeCli.invoices.retrieve(stripe_invoice_id);

		return c.json(stripeInvoice);
	},
});
