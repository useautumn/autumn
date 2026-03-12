import { invoices, stripeToAtmnAmount } from "@autumn/shared";
import type Stripe from "stripe";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getInvoiceDiscounts } from "@/external/stripe/stripeInvoiceUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { generateId } from "@/utils/genUtils.js";

const SyncInvoiceBodySchema = z.object({
	stripe_invoice_id: z.string(),
	product_id: z.string(),
	internal_product_id: z.string(),
	internal_customer_id: z.string(),
});

export const handleSyncInvoice = createRoute({
	body: SyncInvoiceBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const body = c.req.valid("json");

		// Validate customer_id URL param matches body
		const { customer_id } = c.req.param();
		if (customer_id && customer_id !== body.internal_customer_id) {
			const customer = await CusService.getByInternalId({
				db,
				internalId: body.internal_customer_id,
				errorIfNotFound: false,
			});
			if (!customer || customer.id !== customer_id) {
				return c.json({ error: "Customer mismatch" }, 400);
			}
		}

		const stripeCli = createStripeCli({ org, env });

		// Fetch the invoice from Stripe with expanded discounts
		let stripeInvoice: Stripe.Invoice;
		try {
			stripeInvoice = await stripeCli.invoices.retrieve(
				body.stripe_invoice_id,
				{ expand: ["discounts", "discounts.coupon"] },
			);
		} catch (_err) {
			return c.json({ error: "Invoice not found in Stripe" }, 404);
		}

		const atmnTotal = stripeToAtmnAmount({
			amount: stripeInvoice.total,
			currency: stripeInvoice.currency,
		});

		// Check if invoice already exists
		const existing = await db.query.invoices.findFirst({
			where: (inv, { eq }) => eq(inv.stripe_id, body.stripe_invoice_id),
		});

		if (existing) {
			return c.json({ error: "Invoice already synced", invoice: existing }, 409);
		}

		// Insert the invoice
		const invoice: typeof invoices.$inferInsert = {
			id: generateId("inv"),
			internal_customer_id: body.internal_customer_id,
			product_ids: [body.product_id],
			internal_product_ids: [body.internal_product_id],
			created_at: stripeInvoice.created * 1000,
			stripe_id: stripeInvoice.id!,
			hosted_invoice_url: stripeInvoice.hosted_invoice_url || null,
			status: stripeInvoice.status ?? "unknown",
			internal_entity_id: null,
			total: atmnTotal,
			currency: stripeInvoice.currency,
			discounts: getInvoiceDiscounts({
				expandedInvoice: stripeInvoice,
			}),
			items: [],
		};

		const results = await db
			.insert(invoices)
			.values(invoice)
			.returning();

		if (results.length === 0) {
			return c.json({ error: "Failed to insert invoice" }, 500);
		}

		return c.json({ success: true, invoice: results[0] });
	},
});
