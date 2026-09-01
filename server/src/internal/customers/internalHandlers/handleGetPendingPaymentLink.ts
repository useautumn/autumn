import { CusProductStatus, Scopes } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { CusProductService } from "../cusProducts/CusProductService";

/**
 * GET /customers/:customer_id/products/:customer_product_id/payment_link
 * The URL a pending plan is waiting on, resolved from Stripe so it reflects
 * the session or invoice as it stands now.
 */
export const handleGetPendingPaymentLink = createRoute({
	scopes: [Scopes.Customers.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_product_id } = c.req.param();

		const customerProduct = await CusProductService.getFull({
			db: ctx.db,
			id: customer_product_id,
			inStatuses: [CusProductStatus.Pending],
		});

		if (!customerProduct?.metadata_id) return c.json({ url: null });

		const metadata = await MetadataService.get({
			db: ctx.db,
			id: customerProduct.metadata_id,
		});

		if (!metadata) return c.json({ url: null });

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

		if (metadata.stripe_checkout_session_id) {
			const session = await stripeCli.checkout.sessions.retrieve(
				metadata.stripe_checkout_session_id,
			);

			return c.json({ url: session.status === "open" ? session.url : null });
		}

		if (metadata.stripe_invoice_id) {
			const invoice = await stripeCli.invoices.retrieve(
				metadata.stripe_invoice_id,
			);

			return c.json({
				url: invoice.status === "open" ? invoice.hosted_invoice_url : null,
			});
		}

		return c.json({ url: null });
	},
});
