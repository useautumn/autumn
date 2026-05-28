import { type AppEnv, RecaseError, Scopes } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * PATCH /v1/installations/{integrationConfigurationId}/resources/{resourceId}
 * Update a resource
 */
export const handleUpdateResource = createRoute({
	scopes: [Scopes.Public],
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
		const ctx = c.get("ctx");
		const { db, fullCustomer: customer } = ctx;
		const body = c.req.valid("json");

		// Block metadata updates - metadata is set during resource creation and cannot be modified
		if (body.metadata !== undefined) {
			const hasCurrentPlan = !!customer?.customer_products?.some(
				(cp) => !cp?.product?.is_default,
			);

			if (!hasCurrentPlan) {
				throw new RecaseError({
					message:
						"Metadata cannot be updated before a plan exists. Prepaid quantities are fixed at subscription creation time.",
					code: "metadata_update_not_allowed",
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
		}

		const updates: Record<string, any> = {};
		if (body.name) updates.name = body.name;
		if (body.status) updates.status = body.status;
		if (body.metadata !== undefined) updates.metadata = body.metadata;

		console.log(`Vercel, updating resource: `, body);

		let resource: Awaited<ReturnType<typeof VercelResourceService.update>>;
		try {
			resource = await VercelResourceService.update({
				db,
				resourceId,
				installationId: integrationConfigurationId,
				orgId,
				env: env as AppEnv,
				updates,
			});
		} catch (error) {
			if (isUniqueConstraintError(error) && body.name) {
				throw new RecaseError({
					message: `A resource named "${body.name}" already exists for this installation`,
					code: "vercel_resource_name_taken",
					statusCode: StatusCodes.CONFLICT,
				});
			}
			throw error;
		}

		return c.json({
			id: resource.id,
			productId: resource.org_id,
			name: resource.name,
			metadata: resource.metadata,
			status: resource.status,
		});
	},
});
