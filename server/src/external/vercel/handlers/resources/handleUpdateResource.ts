import type { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * PATCH /v1/installations/{integrationConfigurationId}/resources/{resourceId}
 * Update a resource
 */
export const handleUpdateResource = createRoute({
	body: z.object({
		name: z.string().min(1).optional(),
		status: z
			.enum([
				"ready",
				"pending",
				"onboarding",
				"suspended",
				"resumed",
				"uninstalled",
				"error",
			])
			.optional(),
		metadata: z.record(z.any(), z.any()).optional(),
		billingPlanId: z.string().optional(),
		protocolSettings: z
			.object({
				experimentation: z
					.object({
						edgeConfigId: z.string().optional(),
					})
					.optional(),
			})
			.optional(),
	}),
	handler: async (c) => {
		const { orgId, env, integrationConfigurationId, resourceId } =
			c.req.param();
		const { db, logger } = c.get("ctx");
		const body = c.req.valid("json");

		const updates: Record<string, any> = {};
		if (body.name) updates.name = body.name;
		if (body.status) updates.status = body.status;
		if (body.metadata) updates.metadata = body.metadata;

		const resource = await VercelResourceService.update({
			db,
			resourceId,
			installationId: integrationConfigurationId,
			orgId,
			env: env as AppEnv,
			updates,
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
