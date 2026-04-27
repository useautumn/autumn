import { z } from "zod/v4";
import { Scopes } from "@autumn/shared";
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

		return c.json({
			line_items: lineItems,
		});
	},
});
