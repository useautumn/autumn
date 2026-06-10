import { ErrCode, MintKeyParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { mintTokenPair } from "@/internal/auth/customerJwt.js";
import { readFamily, setFamily } from "@/internal/auth/customerJwtEpoch.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";

// Customer tokens always carry exactly the scopes the allowlisted routes need —
// not caller-configurable. Enforced per-route by scopeCheckMiddleware.
const TOKEN_SCOPES: string[] = [
	Scopes.Customers.Read,
	Scopes.Balances.Read,
	Scopes.Balances.Write,
];

export const handleMintKey = createRoute({
	scopes: [Scopes.ApiKeys.Write],
	body: MintKeyParamsSchema,
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

		const family = await readFamily({
			orgId: ctx.org.id,
			customerId: customer_id,
		});
		const refreshKid = family.refreshKid + 1;
		await setFamily({
			orgId: ctx.org.id,
			customerId: customer_id,
			epoch: family.epoch,
			refreshKid,
		});

		const pair = await mintTokenPair({
			customerId: customer_id,
			orgId: ctx.org.id,
			env: ctx.env,
			scopes: TOKEN_SCOPES,
			epoch: family.epoch,
			refreshKid,
		});

		return c.json({
			access_token: pair.accessToken,
			refresh_token: pair.refreshToken,
			expires_at: pair.expiresAt,
			refresh_expires_at: pair.refreshExpiresAt,
		});
	},
});
