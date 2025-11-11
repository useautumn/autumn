import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteCusById } from "@/internal/customers/handlers/handleDeleteCustomer.js";

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

			const deleteResults = await Promise.allSettled(
				resources.map((resource) =>
					VercelResourceService.hardDelete({
						db,
						resourceId: resource.id,
						orgId,
						env: ctx.env,
					}),
				),
			);

			// 2. Delete the customer/installation
			await deleteCusById({
				db: ctx.db,
				org: ctx.org,
				customerId: integrationConfigurationId,
				env: ctx.env,
				logger: ctx.logger,
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
