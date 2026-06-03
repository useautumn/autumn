import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { InvoiceTemplateService } from "../InvoiceTemplateService.js";

export const handleListInvoiceTemplates = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org } = c.get("ctx");
		const templates = await InvoiceTemplateService.list({
			db,
			orgId: org.id,
		});
		return c.json({ templates });
	},
});
