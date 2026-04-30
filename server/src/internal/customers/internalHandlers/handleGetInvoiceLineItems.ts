import { Scopes, stripeToAtmnAmount } from "@autumn/shared";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos/index.js";

export const handleGetInvoiceLineItems = createRoute({
	scopes: [Scopes.Customers.Read],
	body: z.object({
		invoice_ids: z.array(z.string()),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();
		const { db } = ctx;
		const { invoice_ids } = c.req.valid("json");

		await InvoiceService.assertOwnership({
			ctx,
			id: invoice_ids,
			customerId: customer_id,
		});

		const lineItems = await invoiceLineItemRepo.getByInvoiceIds({
			db,
			invoiceIds: invoice_ids,
		});

		if (ctx.org.config.automatic_tax) {
			const stripe = createStripeCli({
				org: ctx.org,
				env: ctx.env,
			});
			const autumnInvoices = await InvoiceService.getMany({
				db,
				ids: invoice_ids,
			});
			const stripeInvoices = [];
			for (const invoice of autumnInvoices) {
				// Sleep for 20ms before each retrieve
				await new Promise((res) => setTimeout(res, 20));
				stripeInvoices.push({
					autumnInvoiceId: invoice.id,
					stripeInvoice: await stripe.invoices.retrieve(invoice.stripe_id),
				});
			}

			// Check if any invoice has automatic_tax.enabled
			const anyAutomaticTax = stripeInvoices.some(
				({ stripeInvoice }) => stripeInvoice.automatic_tax?.enabled,
			);

			if (anyAutomaticTax) {
				const tax_info: Record<string, { taxed_amount: number }> = {};
				for (const { autumnInvoiceId, stripeInvoice } of stripeInvoices) {
					tax_info[autumnInvoiceId] = {
						taxed_amount: stripeToAtmnAmount({
							amount:
								stripeInvoice.total_taxes?.reduce(
									(acc, curr) => acc + curr.amount,
									0,
								) ?? 0,
							currency: stripeInvoice.currency,
						}),
					};
				}
				return c.json({
					line_items: lineItems,
					tax_info,
				});
			} else {
				return c.json({
					line_items: lineItems,
				});
			}
		} else {
			return c.json({
				line_items: lineItems,
			});
		}
	},
});
