import { getAdminEdgeConfigSources } from "@/external/aws/s3/adminS3Config.js";
import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

export const handleGetAdminEdgeConfigSources = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		return c.json(getAdminEdgeConfigSources());
	},
});
