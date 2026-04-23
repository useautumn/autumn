import { getAdminEdgeConfigSources } from "@/external/aws/s3/adminS3Config.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

export const handleGetAdminEdgeConfigSources = createRoute({
	handler: async (c) => {
		return c.json(getAdminEdgeConfigSources());
	},
});
