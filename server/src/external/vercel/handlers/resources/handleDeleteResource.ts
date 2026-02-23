import { AppEnv } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { sendCustomSvixEvent } from "@/external/svix/svixHelpers.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	type VercelResourceDeletedEvent,
	VercelWebhooks,
} from "../../misc/vercelWebhookTypes.js";

/**
 * DELETE /v1/installations/{integrationConfigurationId}/resources/{resourceId}
 * Delete (mark as uninstalled) a resource
 */
export const handleDeleteResource = createRoute({
	handler: async (c) => {
		const { orgId, env, integrationConfigurationId, resourceId } =
			c.req.param();
		const ctx = c.get("ctx");
		const { db, org } = ctx;
		const stripeCli = createStripeCli({ org, env: env as AppEnv });

		await VercelResourceService.delete({
			db,
			resourceId,
			installationId: integrationConfigurationId,
			orgId,
			env: env as AppEnv,
		});

		await sendCustomSvixEvent({
			appId:
				org.processor_configs?.vercel?.svix?.[
					env === AppEnv.Live ? "live_id" : "sandbox_id"
				] ?? "",
			org,
			env: env as AppEnv,
			eventType: VercelWebhooks.ResourceDeleted,
			data: {
				resource: {
					id: resourceId,
				},
				installation_id: integrationConfigurationId,
			} satisfies VercelResourceDeletedEvent,
		});

		const customer = await CusService.getByVercelId({
			ctx,
			vercelInstallationId: integrationConfigurationId,
		});

		customer?.customer_products.forEach(async (x) => {
			x.subscription_ids?.forEach(async (subId) => {
				await stripeCli.subscriptions.cancel(subId);
			});
		});

		return c.body(null, 204);
	},
});
