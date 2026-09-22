import { Scopes } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * Get Stripe invoice by Stripe invoice ID
 * Requires authentication via secret key middleware
 */
export const handleGetStripeInvoice = createRoute({
	scopes: [Scopes.Billing.Read],
	handler: async (c) => {
		const { org, env } = c.get("ctx");
		const { stripe_invoice_id } = c.req.param();

		const stripeCli = createStripeCli({
			org,
			env,
		});

		// The customer is expanded so callers can edit the live record, not the
		// snapshot the invoice took at finalization.
		const stripeInvoice = await stripeCli.invoices.retrieve(stripe_invoice_id, {
			expand: ["customer.tax_ids"],
		});

		return c.json(stripeInvoice);
	},
});
