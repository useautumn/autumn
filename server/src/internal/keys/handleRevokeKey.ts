import { ErrCode, RevokeKeyParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { bumpEpoch } from "@/internal/auth/customerJwtEpoch.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";

export const handleRevokeKey = createRoute({
	scopes: [Scopes.ApiKeys.Write],
	body: RevokeKeyParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.valid("json");

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customer_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		if (!customer) {
			throw new RecaseError({
				message: `Customer ${customer_id} not found`,
				code: ErrCode.CustomerNotFound,
				statusCode: 404,
			});
		}

		await bumpEpoch({
			internalCustomerId: customer.internal_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		return c.json({ revoked: true });
	},
});
