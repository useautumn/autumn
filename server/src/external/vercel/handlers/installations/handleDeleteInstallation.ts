import { AppEnv } from "@autumn/shared";
import { sendCustomSvixEvent } from "@/external/svix/svixHelpers.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteCusById } from "@/internal/customers/handlers/handleDeleteCustomerV2.js";
import {
	type VercelResourceDeletedEvent,
	VercelWebhooks,
} from "../../misc/vercelWebhookTypes.js";

export const handleDeleteInstallation = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { integrationConfigurationId, orgId } = c.req.param();
		const { db, org, logger } = ctx;

		try {
			const resources = await VercelResourceService.listByInstallation({
				db,
				installationId: integrationConfigurationId,
				orgId,
				env: ctx.env,
			});

			await Promise.allSettled(
				resources.flatMap((resource) => [
					VercelResourceService.hardDelete({
						db,
						resourceId: resource.id,
						orgId,
						env: ctx.env,
					}),
					sendCustomSvixEvent({
						appId:
							org.processor_configs?.vercel?.svix?.[
								ctx.env === AppEnv.Live ? "live_id" : "sandbox_id"
							] ?? "",
						org,
						env: ctx.env,
						eventType: VercelWebhooks.ResourceDeleted,
						data: {
							resource: {
								id: resource.id,
							},
							installation_id: integrationConfigurationId,
						} satisfies VercelResourceDeletedEvent,
					}),
				]),
			);

			// 2. Delete the customer/installation
			await deleteCusById({
				ctx,
				customerId: integrationConfigurationId,
				deleteInStripe: true,
			});
		} catch (error) {
			logger.error("Error deleting installation", {
				error,
				integrationConfigurationId,
			});
		}
		return c.json(
			{
				finalized: true,
			},
			200,
		);
	},
});
