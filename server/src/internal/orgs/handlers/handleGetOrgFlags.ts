import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getRuntimeFeatureFlags } from "@/internal/misc/featureFlags/featureFlagStore.js";

/** GET /v1/orgs/flags — exposes the current feature flags to the frontend. */
export const handleGetOrgFlags = createRoute({
	handler: async (c) => {
		const flags = getRuntimeFeatureFlags();
		return c.json({
			...flags,
			skipOverageSubmissionFlags: undefined,
		});
	},
});
