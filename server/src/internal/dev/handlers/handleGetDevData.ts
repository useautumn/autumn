import { Scopes } from "@autumn/shared";
import { getSvixDashboardUrl } from "../../../external/svix/svixHelpers";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { apiKeyRepo } from "../repos/index.js";

export const handleGetDevData = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, env, org } = ctx;
		const apiKeys = await apiKeyRepo.listByOrg({
			db,
			orgId: org.id,
			env,
			visibility: "visible",
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
