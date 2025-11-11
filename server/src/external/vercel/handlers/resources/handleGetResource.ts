import type { AppEnv } from "@autumn/shared";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * GET /v1/installations/{integrationConfigurationId}/resources/{resourceId}
 * Get a single resource by ID
 */
export const handleGetResource = createRoute({
	handler: async (c) => {
		const { orgId, env, integrationConfigurationId, resourceId } =
			c.req.param();
		const { db, logger } = c.get("ctx");

		logger.info("Getting Vercel resource", {
			integrationConfigurationId,
			resourceId,
		});

		const resource = await VercelResourceService.getByIdAndInstallation({
			db,
			resourceId,
			installationId: integrationConfigurationId,
			orgId,
			env: env as AppEnv,
		});

		return c.json({
			id: resource.id,
			productId: resource.org_id,
			name: resource.name,
			metadata: resource.metadata,
			status: resource.status,
		});
	},
});
