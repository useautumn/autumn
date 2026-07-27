import {
	AffectedResource,
	InsertInvoicesParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { invoiceActions } from "@/internal/invoices/actions";

export const handleInsertInvoices = createRoute({
	scopes: [Scopes.Billing.Write],
	body: InsertInvoicesParamsSchema,
	resource: AffectedResource.Invoice,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		const result = await invoiceActions.insert({ ctx, params });
		return c.json(result, 200);
	},
});
