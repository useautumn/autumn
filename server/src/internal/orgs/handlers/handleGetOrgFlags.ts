import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import { getRuntimeFeatureFlags } from "@/internal/misc/featureFlags/featureFlagStore.js";

export const handleGetOrgFlags = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const flags = getRuntimeFeatureFlags();
		return c.json(flags);
	},
});
