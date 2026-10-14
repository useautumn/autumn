import { Scopes } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

export const handleGetStripeInvoice = createRoute({
	scopes: [Scopes.Billing.Read],
	handler: async (c) => {
		const { org, env } = c.get("ctx");
		const { stripe_invoice_id } = c.req.param();

		const stripeCli = createStripeCli({
			org,
			env,
		});

		const stripeInvoice = await stripeCli.invoices.retrieve(stripe_invoice_id, {
			expand: ["customer.tax_ids", "payments.data.payment.payment_intent"],
		});

		return c.json(stripeInvoice);
	},
});
