import { RecaseError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { InvoiceTemplateService } from "../InvoiceTemplateService.js";
import { invoiceTemplateBodySchema } from "../invoiceTemplateBody.js";

export const handleUpdateInvoiceTemplate = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: invoiceTemplateBodySchema,
	handler: async (c) => {
		const { db, org } = c.get("ctx");
		const { id } = c.req.param();
		const values = c.req.valid("json");
		const template = await InvoiceTemplateService.update({
			db,
			orgId: org.id,
			id,
			update: values,
		});
		if (!template) {
			throw new RecaseError({
				message: "Invoice template not found",
				code: "invoice_template_not_found",
				statusCode: 404,
			});
		}
		return c.json({ template });
	},
});
