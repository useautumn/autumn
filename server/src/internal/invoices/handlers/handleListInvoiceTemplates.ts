import {
	AffectedResource,
	ListInvoiceTemplatesParamsSchema,
	type ListInvoiceTemplatesResponse,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService.js";

export const handleListInvoiceTemplates = createRoute({
	scopes: [Scopes.Customers.Read],
	body: ListInvoiceTemplatesParamsSchema,
	resource: AffectedResource.Invoice,
	handler: async (c) => {
		const { db, org } = c.get("ctx");
		const { limit, offset } = c.req.valid("json");

		const { templates, hasMore } = await InvoiceTemplateService.listPage({
			db,
			orgId: org.id,
			limit,
			offset,
		});

		return c.json<ListInvoiceTemplatesResponse>({
			list: templates,
			total: templates.length,
			limit,
			offset,
			has_more: hasMore,
		});
	},
});
