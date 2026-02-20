import { AppEnv } from "@autumn/shared";
import { sendCustomSvixEvent } from "@/external/svix/svixHelpers.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions/index.js";
import { CusService } from "@/internal/customers/CusService.js";
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

			// 2. Get customer by Vercel installation ID (customer.id may differ from installation_id)
			const customer = await CusService.getByVercelId({
				db,
				vercelInstallationId: integrationConfigurationId,
				orgId,
				env: ctx.env,
			});

			// 3. Delete the customer/installation using the actual customer ID
			if (customer) {
				await customerActions.delete({
					ctx,
					params: {
						customer_id: customer.internal_id,
						delete_in_stripe: true,
					},
				});
			} else {
				logger.warn(
					`Customer not found for Vercel installation ${integrationConfigurationId}`,
				);
			}
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
