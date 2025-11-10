import type { AppEnv } from "@autumn/shared";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleListBillingPlansPerInstall } from "./handlers/handleListBillingPlans.js";
import { handleUpdateBillingPlan } from "./handlers/handleUpdateBillingPlan.js";
import { handleDeleteInstallation } from "./handlers/installations/handleDeleteInstallation.js";
import { handleGetInstallation } from "./handlers/installations/handleGetInstallation.js";
import { handleUpsertInstallation } from "./handlers/installations/handleUpsertInstallation.js";
import { handleMarketplaceInvoicePaid } from "./handlers/marketplace/handleMarketplaceInvoicePaid.js";
import { handleCreateResource } from "./handlers/resources/handleCreateResource.js";
import { vercelSeederMiddleware } from "./misc/vercelMiddleware.js";

export const vercelWebhookRouter = new Hono<HonoEnv>();

vercelWebhookRouter.get(
	"/:orgId/:env/v1/products/:integrationConfigurationId/plans",
	vercelSeederMiddleware,
	...handleListBillingPlansPerInstall,
);

vercelWebhookRouter.get(
	"/:orgId/:env/v1/installations/:integrationConfigurationId/plans",
	vercelSeederMiddleware,
	...handleListBillingPlansPerInstall,
);

vercelWebhookRouter.get(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	vercelSeederMiddleware,
	...handleGetInstallation,
);

vercelWebhookRouter.put(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	vercelSeederMiddleware,
	...handleUpsertInstallation,
);

vercelWebhookRouter.patch(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	vercelSeederMiddleware,
	...handleUpdateBillingPlan,
);

vercelWebhookRouter.post(
	"/:orgId/:env/v1/installations/:integrationConfigurationId/resources",
	vercelSeederMiddleware,
	...handleCreateResource,
);

vercelWebhookRouter.delete(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	vercelSeederMiddleware,
	...handleDeleteInstallation,
);

// Vercel marketplace webhooks
vercelWebhookRouter.all("/:orgId/:env/*", vercelSeederMiddleware, async (c) => {
	const { db, org, env, logger } = c.get("ctx");
	const method = c.req.method;
	const params = c.req.param();
	const headers = c.req.header();
	let body: any;
	try {
		body = await c.req.json();
	} catch {
		body = {};
	}

	logger.info("Vercel webhook received", {
		method,
		eventType: body.type,
		params,
		headers,
		body,
	});
	console.log("Vercel webhook headers", JSON.stringify(headers, null, 4));
	console.log("Vercel webhook received", method, params, body);

	if (method === "POST") {
		const eventType = body.type;

		try {
			switch (eventType) {
				case "marketplace.invoice.paid":
					await handleMarketplaceInvoicePaid({
						db,
						org,
						env: env as AppEnv,
						logger,
						payload: body.payload,
					});
					return c.json({ success: true }, 200);

				case "marketplace.invoice.notpaid":
					logger.warn("marketplace.invoice.notpaid not yet implemented");
					return c.json({ received: true }, 200);

				default:
					logger.warn("Unhandled Vercel webhook type", { eventType });
					return c.json({ received: true }, 200);
			}
		} catch (error: any) {
			logger.error("Failed to process Vercel marketplace webhook", {
				error: error.message,
				eventType,
			});
			return c.json({ error: error.message }, 500);
		}
	}

	return c.body(null, 200);
});
