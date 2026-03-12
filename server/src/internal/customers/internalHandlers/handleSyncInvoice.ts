import { invoices, stripeToAtmnAmount } from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	getInvoiceDiscounts,
	getStripeExpandedInvoice,
} from "@/external/stripe/stripeInvoiceUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { generateId } from "@/utils/genUtils.js";

const SyncInvoiceBodySchema = z.object({
	stripe_invoice_id: z.string().startsWith("in_"),
	product_id: z.string(),
	internal_product_id: z.string(),
});

export const handleSyncInvoice = createRoute({
	body: SyncInvoiceBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, db } = ctx;
		const body = c.req.valid("json");
		const { customer_id } = c.req.param();

		// Resolve customer from URL param
		const customer = await CusService.getByInternalId({
			db,
			internalId: customer_id,
			errorIfNotFound: false,
		});

		if (!customer) {
			return c.json({ error: "Customer not found" }, 404);
		}

		// Check if invoice already exists
		const existing = await db.query.invoices.findFirst({
			where: (inv, { eq }) => eq(inv.stripe_id, body.stripe_invoice_id),
		});

		if (existing) {
			return c.json({ error: "Invoice already synced", invoice: existing }, 409);
		}

		const stripeCli = createStripeCli({ org, env });

		// Fetch the invoice from Stripe (reuse shared utility for expanded discounts)
		let stripeInvoice;
		try {
			stripeInvoice = await getStripeExpandedInvoice({
				stripeCli,
				stripeInvoiceId: body.stripe_invoice_id,
			});
		} catch (_err) {
			return c.json({ error: "Invoice not found in Stripe" }, 404);
		}

		// Insert the invoice
		const [result] = await db
			.insert(invoices)
			.values({
				id: generateId("inv"),
				internal_customer_id: customer.internal_id,
				product_ids: [body.product_id],
				internal_product_ids: [body.internal_product_id],
				created_at: stripeInvoice.created * 1000,
				stripe_id: stripeInvoice.id!,
				hosted_invoice_url: stripeInvoice.hosted_invoice_url || null,
				status: stripeInvoice.status ?? "unknown",
				internal_entity_id: null,
				total: stripeToAtmnAmount({
					amount: stripeInvoice.total,
					currency: stripeInvoice.currency,
				}),
				currency: stripeInvoice.currency,
				discounts: getInvoiceDiscounts({ expandedInvoice: stripeInvoice }),
				items: [],
			} satisfies typeof invoices.$inferInsert)
			.returning();

		if (!result) {
			return c.json({ error: "Failed to insert invoice" }, 500);
		}

		return c.json({ success: true, invoice: result });
	},
});
