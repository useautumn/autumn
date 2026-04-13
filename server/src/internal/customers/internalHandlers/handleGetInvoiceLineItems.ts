import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos/index.js";

export const handleGetInvoiceLineItems = createRoute({
	body: z.object({
		invoice_ids: z.array(z.string()),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;
		const { invoice_ids } = c.req.valid("json");

		const lineItems = await invoiceLineItemRepo.getByInvoiceIds({
			db,
			invoiceIds: invoice_ids,
		});

		return c.json({
			line_items: lineItems,
		});
	},
});
