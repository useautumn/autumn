import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { generateId } from "@/utils/genUtils.js";
import { InvoiceTemplateService } from "../InvoiceTemplateService.js";
import { invoiceTemplateBodySchema } from "../invoiceTemplateBody.js";

export const handleCreateInvoiceTemplate = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: invoiceTemplateBodySchema,
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const values = c.req.valid("json");
		const template = await InvoiceTemplateService.create({
			db,
			orgId: org.id,
			env,
			internalId: generateId("itmpl"),
			id: generateId("it"),
			values,
		});
		return c.json({ template });
	},
});
