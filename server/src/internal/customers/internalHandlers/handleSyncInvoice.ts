import type Stripe from "stripe";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getStripeExpandedInvoice } from "@/external/stripe/stripeInvoiceUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { upsertInvoiceFromStripe } from "@/internal/invoices/actions/upsertFromStripe";
import { ProductService } from "@/internal/products/ProductService.js";

const SyncInvoiceBodySchema = z.object({
	stripe_invoice_id: z.string().startsWith("in_"),
	internal_product_id: z.string(),
});

export const handleSyncInvoice = createRoute({
	body: SyncInvoiceBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const body = c.req.valid("json");
		const { customer_id } = c.req.param();

		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
			allowNotFound: true,
		});

		if (!customer) {
			return c.json({ error: "Customer not found" }, 404);
		}

		const fullProduct = await ProductService.getFull({
			db,
			idOrInternalId: body.internal_product_id,
			orgId: org.id,
			env,
			allowNotFound: true,
		});

		if (!fullProduct) {
			return c.json({ error: "Product not found" }, 404);
		}

		const stripeCli = createStripeCli({ org, env });

		let stripeInvoice: Stripe.Invoice;
		try {
			stripeInvoice = await getStripeExpandedInvoice({
				stripeCli,
				stripeInvoiceId: body.stripe_invoice_id,
			});
		} catch (_err) {
			return c.json({ error: "Invoice not found in Stripe" }, 404);
		}

		const invoice = await upsertInvoiceFromStripe({
			ctx,
			stripeInvoice,
			fullCustomer: customer,
			fullProducts: [fullProduct],
			internalEntityId: customer.entity?.internal_id,
		});

		if (!invoice) {
			return c.json({ error: "Failed to upsert invoice" }, 500);
		}

		return c.json({ success: true, invoice });
	},
});
