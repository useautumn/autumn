import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getRuntimeFeatureFlags } from "@/internal/misc/edgeConfigs/featureFlags/featureFlagStore.js";

/** GET /v1/orgs/flags — exposes the current feature flags to the frontend. */
export const handleGetOrgFlags = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const flags = getRuntimeFeatureFlags();
		return c.json(flags);
	},
});
