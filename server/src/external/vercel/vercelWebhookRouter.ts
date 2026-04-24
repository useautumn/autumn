import { AppEnv } from "@autumn/shared";
import { Hono } from "hono";
import { handleRotateResourceSecret } from "@/external/vercel/handlers/resources/handleRotateResourceSecret.js";
import { analyticsMiddleware } from "@/honoMiddlewares/analyticsMiddleware.js";
import { traceEnrichMiddleware } from "@/honoMiddlewares/traceMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { sendCustomSvixEvent } from "../svix/svixHelpers.js";
import { handleListBillingPlansPerInstall } from "./handlers/handleListBillingPlans.js";
import { handleUpdateVercelBillingPlan } from "./handlers/handleUpdateBillingPlan.js";
import { handleDeleteInstallation } from "./handlers/installations/handleDeleteInstallation.js";
import { handleGetInstallation } from "./handlers/installations/handleGetInstallation.js";
import { handleUpsertInstallation } from "./handlers/installations/handleUpsertInstallation.js";
import { handleMarketplaceInvoicePaid } from "./handlers/marketplace/handleMarketplaceInvoicePaid.js";
import { handleMarketplaceInvoiceNotPaid } from "./handlers/marketplace/handleMarketplaceInvoidNotPaid.js";
import { handleCreateResource } from "./handlers/resources/handleCreateResource.js";
import { handleDeleteResource } from "./handlers/resources/handleDeleteResource.js";
import { handleGetResource } from "./handlers/resources/handleGetResource.js";
import { handleUpdateResource } from "./handlers/resources/handleUpdateResource.js";
import {
	handleAcceptResourceTransfer,
	handleCreateResourceTransfer,
	handleVerifyResourceTransfer,
} from "./handlers/transfers/handleResourceTransfers.js";
import { captureRawBody } from "./misc/rawBodyMiddleware.js";
import { vercelOidcAuthMiddleware } from "./misc/vercelAuth.js";
import { vercelCustomerMiddleware } from "./misc/vercelCustomerMiddleware.js";
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

// Global middlewares for all vercel webhook routes
vercelWebhookRouter.use(
	"/:orgId/:env/*",
	vercelSeederMiddleware,
	analyticsMiddleware,
	traceEnrichMiddleware,
);

// Product-level plans (no integrationConfigurationId in path)
vercelWebhookRouter.get(
	"/:orgId/:env/v1/products/:productId/plans",
	vercelOidcAuthMiddleware,
	...handleListBillingPlansPerInstall,
);

// --- Installation sub-router ---
// Mounted at /:orgId/:env/v1/installations/:integrationConfigurationId
// All routes get OIDC auth + customer middleware automatically
const installationsRouter = new Hono<HonoEnv>();

installationsRouter.use(
	"/*",
	vercelOidcAuthMiddleware,
	vercelCustomerMiddleware,
);
installationsRouter.use(
	"/",
	vercelOidcAuthMiddleware,
	vercelCustomerMiddleware,
);

// Plans
installationsRouter.get("/plans", ...handleListBillingPlansPerInstall);

// Installation CRUD
installationsRouter.get("/", ...handleGetInstallation);
installationsRouter.put("/", ...handleUpsertInstallation);
installationsRouter.patch("/", ...handleUpdateVercelBillingPlan);
installationsRouter.delete("/", ...handleDeleteInstallation);

// Resources
installationsRouter.post("/resources", ...handleCreateResource);
installationsRouter.get("/resources/:resourceId", ...handleGetResource);
installationsRouter.patch("/resources/:resourceId", ...handleUpdateResource);
installationsRouter.delete("/resources/:resourceId", ...handleDeleteResource);
installationsRouter.post(
	"/resources/:resourceId/secrets/rotate",
	...handleRotateResourceSecret,
);

// Resource transfers
installationsRouter.post(
	"/resource-transfer-requests",
	...handleCreateResourceTransfer,
);
installationsRouter.get(
	"/resource-transfer-requests/:providerClaimId/verify",
	...handleVerifyResourceTransfer,
);
installationsRouter.post(
	"/resource-transfer-requests/:providerClaimId/accept",
	...handleAcceptResourceTransfer,
);

vercelWebhookRouter.route(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	installationsRouter,
);

// Vercel marketplace webhooks - POST with signature validation
vercelWebhookRouter.post(
	"/:orgId/:env/*",
	captureRawBody,
	vercelSignatureMiddleware,
	vercelLogMiddleware,
	async (c) => {
		const { org, env, logger } = c.get("ctx");
		const ctx = c.get("ctx");
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
						ctx,
						payload: body.payload,
					});
					return c.json({ success: true }, 200);

				case "marketplace.invoice.notpaid":
					await handleMarketplaceInvoiceNotPaid({
						ctx,
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
				error,
				eventType,
			});
			return c.json({ error: error.message }, 500);
		}
	},
);

// Fallback for other methods
vercelWebhookRouter.all("/:orgId/:env/*", async (c) => {
	return c.body(null, 200);
});
