import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteCusById } from "@/internal/customers/handlers/handleDeleteCustomer.js";

export const handleDeleteInstallation = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { integrationConfigurationId } = c.req.param();
		const { db, org } = ctx;

		try {
			await deleteCusById({
				db: ctx.db,
				org: ctx.org,
				customerId: integrationConfigurationId,
				env: ctx.env,
				logger: ctx.logger,
				deleteInStripe: true,
			});
		} catch (error) {
			console.log(
				"ERROR: Error deleting customer: --------------------------------",
			);
			console.log(error);
			console.log("--------------------------------");
		}
		return c.json(
			{
				finalized: true,
			},
			200,
		);
	},
});
