import { type AppEnv, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
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
		const { db } = c.get("ctx");
		const body = c.req.valid("json");

		// Block metadata updates - metadata is set during resource creation and cannot be modified
		if (body.metadata !== undefined) {
			throw new RecaseError({
				message:
					"Metadata cannot be updated after resource creation. Prepaid quantities are fixed at subscription creation time.",
				code: "metadata_update_not_allowed",
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const updates: Record<string, any> = {};
		if (body.name) updates.name = body.name;
		if (body.status) updates.status = body.status;

		console.log(`Vercel, updating resource: `, body);

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
