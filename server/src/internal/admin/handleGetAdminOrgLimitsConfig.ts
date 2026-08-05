import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getOrgLimitsConfigFromSource,
	getRuntimeOrgLimitsStatus,
} from "@/internal/misc/edgeConfigs/orgLimits/orgLimitsStore.js";

export const handleGetAdminOrgLimitsConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeOrgLimitsStatus();
		const config = await getOrgLimitsConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
