import { getSvixDashboardUrl } from "../../../external/svix/svixHelpers";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { ApiKeyService } from "../ApiKeyService";

export const handleGetDevData = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, env, org } = ctx;
		const apiKeys = await ApiKeyService.getByOrg({
			db,
			orgId: org.id,
			env,
		});

		const dashboardUrl = await getSvixDashboardUrl({
			env,
			org,
		});

		return c.json({
			api_keys: apiKeys,
			org,
			svix_dashboard_url: dashboardUrl || null,
		});
	},
});
