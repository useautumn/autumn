import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FeatureFlagConfigSchema } from "@/internal/misc/edgeConfigs/featureFlags/featureFlagSchemas.js";
import { updateFullFeatureFlagConfig } from "@/internal/misc/edgeConfigs/featureFlags/featureFlagStore.js";

export const handleUpsertAdminFeatureFlagsConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: FeatureFlagConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullFeatureFlagConfig({ config: body });

		return c.json({ success: true });
	},
});
