import type { AppEnv } from "@autumn/shared";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * DELETE /v1/installations/{integrationConfigurationId}/resources/{resourceId}
 * Delete (mark as uninstalled) a resource
 */
export const handleDeleteResource = createRoute({
	handler: async (c) => {
		const { orgId, env, integrationConfigurationId, resourceId } =
			c.req.param();
		const { db } = c.get("ctx");

		await VercelResourceService.delete({
			db,
			resourceId,
			installationId: integrationConfigurationId,
			orgId,
			env: env as AppEnv,
		});

		return c.body(null, 204);
	},
});
