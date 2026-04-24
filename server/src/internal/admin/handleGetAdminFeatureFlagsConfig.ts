import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import {
	getFeatureFlagConfigFromSource,
	getRuntimeFeatureFlagStatus,
} from "@/internal/misc/featureFlags/featureFlagStore.js";

export const handleGetAdminFeatureFlagsConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getRuntimeFeatureFlagStatus();
		const config = await getFeatureFlagConfigFromSource();

		return c.json({
			...config,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
