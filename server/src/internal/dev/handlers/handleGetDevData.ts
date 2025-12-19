import { getSvixDashboardUrlAndPublicToken } from "../../../external/svix/svixHelpers";
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

		const svixData = await getSvixDashboardUrlAndPublicToken({
			env,
			org,
		});

		if (!svixData) {
			return c.json({
				api_keys: apiKeys,
				org,
				svix_dashboard_url: null,
				svix_public_token: null,
				svix_app_id: null,
			});
		}
		return c.json({
			api_keys: apiKeys,
			org,

			svix_dashboard_url: svixData.dashboardUrl,
			svix_public_token: svixData.publicToken,
			svix_app_id: svixData.appId,
		});
	},
});
