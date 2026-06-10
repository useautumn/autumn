import { ErrCode, RevokeKeyParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { bumpEpoch } from "@/internal/auth/customerJwtEpoch.js";
import RecaseError from "@/utils/errorUtils.js";

export const handleRevokeKey = createRoute({
	scopes: [Scopes.ApiKeys.Write],
	body: RevokeKeyParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.valid("json");

		const result = await bumpEpoch({
			orgId: ctx.org.id,
			customerId: customer_id,
		});
		if (result.succeeded === 0) {
			// The bump persisted nowhere — do NOT claim the revoke succeeded.
			throw new RecaseError({
				message: "Failed to revoke: no Redis region was reachable",
				code: ErrCode.InternalError,
				statusCode: 503,
			});
		}
		if (result.succeeded < result.attempted) {
			ctx.logger.warn(
				`keys.revoke partial propagation: ${result.succeeded}/${result.attempted} regions`,
				{ orgId: ctx.org.id, customerId: customer_id },
			);
		}

		return c.json({ revoked: true });
	},
});
