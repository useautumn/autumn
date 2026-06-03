import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { InvoiceTemplateService } from "../InvoiceTemplateService.js";

export const handleDeleteInvoiceTemplate = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { id } = c.req.param();
		await InvoiceTemplateService.delete({ db, orgId: org.id, env, id });
		return c.json({ success: true });
	},
});
