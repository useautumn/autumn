import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import { FeatureFlagConfigSchema } from "@/internal/misc/featureFlags/featureFlagSchemas.js";
import { updateFullFeatureFlagConfig } from "@/internal/misc/featureFlags/featureFlagStore.js";

export const handleUpsertAdminFeatureFlagsConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: FeatureFlagConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullFeatureFlagConfig({ config: body });

		return c.json({ success: true });
	},
});
