import { z } from "zod/v4";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";
import { createRoute } from "../../honoMiddlewares/routeHandler";

const RequestBodySchema = z.object({
	invoice_ids: z.array(z.string()),
});

export const handleGetInvoiceLineItems = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;

		const body = await c.req.json();
		const { invoice_ids } = RequestBodySchema.parse(body);

		const lineItems = await invoiceLineItemRepo.getByInvoiceIds({
			db,
			invoiceIds: invoice_ids,
		});

		return c.json({
			line_items: lineItems,
		});
	},
});
