import { CusProductStatus, Scopes } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeCheckoutSession } from "@/external/stripe/checkoutSessions/operations/getStripeCheckoutSession";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { CusService } from "../CusService";

export const handleGetPendingPaymentLink = createRoute({
	scopes: [Scopes.Customers.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id, customer_product_id } = c.req.param();

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
			inStatuses: [CusProductStatus.Pending],
			withEntities: false,
		});

		const customerProduct = fullCustomer.customer_products.find(
			(candidate) => candidate.id === customer_product_id,
		);

		if (!customerProduct?.metadata_id) return c.json({ url: null });

		const metadata = await MetadataService.get({
			db: ctx.db,
			id: customerProduct.metadata_id,
		});

		if (!metadata) return c.json({ url: null });

		if (metadata.stripe_checkout_session_id) {
			const session = await getStripeCheckoutSession({
				ctx,
				checkoutSessionId: metadata.stripe_checkout_session_id,
				expand: [],
			});

			return c.json({ url: session.status === "open" ? session.url : null });
		}

		if (metadata.stripe_invoice_id) {
			const invoice = await getStripeInvoice({
				stripeClient: createStripeCli({ org: ctx.org, env: ctx.env }),
				invoiceId: metadata.stripe_invoice_id,
				expand: [],
			});

			return c.json({
				url: invoice.status === "open" ? invoice.hosted_invoice_url : null,
			});
		}

		return c.json({ url: null });
	},
});
