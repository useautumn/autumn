import { AppEnv } from "@autumn/shared";
import { Hono } from "hono";
import { analyticsMiddleware } from "@/honoMiddlewares/analyticsMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { sendCustomSvixEvent } from "../svix/svixHelpers.js";
import { handleListBillingPlansPerInstall } from "./handlers/handleListBillingPlans.js";
import { handleUpdateBillingPlan } from "./handlers/handleUpdateBillingPlan.js";
import { handleDeleteInstallation } from "./handlers/installations/handleDeleteInstallation.js";
import { handleGetInstallation } from "./handlers/installations/handleGetInstallation.js";
import { handleUpsertInstallation } from "./handlers/installations/handleUpsertInstallation.js";
import { handleMarketplaceInvoicePaid } from "./handlers/marketplace/handleMarketplaceInvoicePaid.js";
import { handleMarketplaceInvoiceNotPaid } from "./handlers/marketplace/handleMarketplaceInvoidNotPaid.js";
import { handleCreateResource } from "./handlers/resources/handleCreateResource.js";
import { handleDeleteResource } from "./handlers/resources/handleDeleteResource.js";
import { handleGetResource } from "./handlers/resources/handleGetResource.js";
import { handleUpdateResource } from "./handlers/resources/handleUpdateResource.js";
import { captureRawBody } from "./misc/rawBodyMiddleware.js";
import { vercelOidcAuthMiddleware } from "./misc/vercelAuth.js";
import {
	vercelLogMiddleware,
	vercelSeederMiddleware,
} from "./misc/vercelMiddleware.js";
import { vercelSignatureMiddleware } from "./misc/vercelSignatureMiddleware.js";
import {
	type VercelWebhookEvent,
	VercelWebhooks,
} from "./misc/vercelWebhookTypes.js";

export const vercelWebhookRouter = new Hono<HonoEnv>();

vercelWebhookRouter.use(
	"/:orgId/:env/*",
	vercelSeederMiddleware,
	analyticsMiddleware,
);

vercelWebhookRouter.get(
	"/:orgId/:env/v1/products/:productId/plans",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleListBillingPlansPerInstall,
);

vercelWebhookRouter.get(
	"/:orgId/:env/v1/installations/:integrationConfigurationId/plans",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleListBillingPlansPerInstall,
);

vercelWebhookRouter.get(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleGetInstallation,
);

vercelWebhookRouter.put(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleUpsertInstallation,
);

vercelWebhookRouter.patch(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleUpdateBillingPlan,
);

vercelWebhookRouter.post(
	"/:orgId/:env/v1/installations/:integrationConfigurationId/resources",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleCreateResource,
);

vercelWebhookRouter.get(
	"/:orgId/:env/v1/installations/:integrationConfigurationId/resources/:resourceId",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleGetResource,
);

vercelWebhookRouter.patch(
	"/:orgId/:env/v1/installations/:integrationConfigurationId/resources/:resourceId",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleUpdateResource,
);

vercelWebhookRouter.delete(
	"/:orgId/:env/v1/installations/:integrationConfigurationId/resources/:resourceId",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleDeleteResource,
);

vercelWebhookRouter.delete(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	vercelSeederMiddleware,
	vercelOidcAuthMiddleware,
	...handleDeleteInstallation,
);

// Vercel marketplace webhooks - POST with signature validation
vercelWebhookRouter.post(
	"/:orgId/:env/*",
	vercelSeederMiddleware,
	captureRawBody,
	vercelSignatureMiddleware,
	vercelLogMiddleware,
	async (c) => {
		const { db, org, env, logger } = c.get("ctx");
		let body: any;
		try {
			body = await c.req.json();
		} catch {
			body = {};
		}

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
					await handleMarketplaceInvoiceNotPaid({
						db,
						org,
						env: env as AppEnv,
						logger,
						payload: body.payload,
					});
					return c.json({ received: true }, 200);

				default:
					await sendCustomSvixEvent({
						appId:
							org.processor_configs?.vercel?.svix?.[
								env === AppEnv.Live ? "live_id" : "sandbox_id"
							] ?? "",
						org,
						env: env as AppEnv,
						eventType: VercelWebhooks.WebhookEvent,
						data: {
							installation_id: body.installation_id,
							event: body,
						} satisfies VercelWebhookEvent,
					});
					return c.json({ received: true }, 200);
			}
		} catch (error: any) {
			logger.error("Failed to process Vercel marketplace webhook", {
				error: error.message,
				eventType,
			});
			return c.json({ error: error.message }, 500);
		}
	},
);

// Fallback for other methods
vercelWebhookRouter.all("/:orgId/:env/*", vercelSeederMiddleware, async (c) => {
	return c.body(null, 200);
});
