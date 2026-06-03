import { RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { InvoiceTemplateService } from "./InvoiceTemplateService.js";

const upsertBodySchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	footer: z.string().trim().min(1, "Footer is required"),
});

const handleListInvoiceTemplates = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const templates = await InvoiceTemplateService.list({
			db,
			orgId: org.id,
			env,
		});
		return c.json({ templates });
	},
});

const handleCreateInvoiceTemplate = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: upsertBodySchema,
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { name, footer } = c.req.valid("json");
		const template = await InvoiceTemplateService.create({
			db,
			orgId: org.id,
			env,
			internalId: generateId("itmpl"),
			id: generateId("it"),
			name,
			footer,
		});
		return c.json({ template });
	},
});

const handleUpdateInvoiceTemplate = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: upsertBodySchema,
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { id } = c.req.param();
		const { name, footer } = c.req.valid("json");
		const template = await InvoiceTemplateService.update({
			db,
			orgId: org.id,
			env,
			id,
			update: { name, footer },
		});
		if (!template) {
			throw new RecaseError({ message: "Invoice template not found" });
		}
		return c.json({ template });
	},
});

const handleDeleteInvoiceTemplate = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { id } = c.req.param();
		await InvoiceTemplateService.delete({ db, orgId: org.id, env, id });
		return c.json({ success: true });
	},
});

export const invoiceTemplateRouter = new Hono<HonoEnv>();

invoiceTemplateRouter.get("", ...handleListInvoiceTemplates);
invoiceTemplateRouter.post("", ...handleCreateInvoiceTemplate);
invoiceTemplateRouter.patch("/:id", ...handleUpdateInvoiceTemplate);
invoiceTemplateRouter.delete("/:id", ...handleDeleteInvoiceTemplate);
