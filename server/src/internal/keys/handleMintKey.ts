import { ErrCode, MintKeyParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { mintTokenPair } from "@/internal/auth/customerJwt.js";
import { readFamily, setFamily } from "@/internal/auth/customerJwtEpoch.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError from "@/utils/errorUtils.js";

export const handleMintKey = createRoute({
	scopes: [Scopes.ApiKeys.Write],
	body: MintKeyParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id, indefinite } = c.req.valid("json");

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
			internalCustomerId: customer.internal_id,
		});
		const epoch = family?.epoch ?? 0;
		const refreshKid = (family?.refreshKid ?? 0) + 1;

		await setFamily({
			internalCustomerId: customer.internal_id,
			orgId: ctx.org.id,
			env: ctx.env,
			epoch,
			refreshKid,
			indefinite: indefinite ?? false,
		});

		const pair = await mintTokenPair({
			customerId: customer.id ?? customer.internal_id, // external `sub`
			internalCustomerId: customer.internal_id,
			env: ctx.env,
			epoch,
			refreshKid,
			indefinite: indefinite ?? false,
		});

		return c.json({
			access_token: pair.accessToken,
			refresh_token: pair.refreshToken,
			expires_at: pair.expiresAt,
			refresh_expires_at: pair.refreshExpiresAt,
		});
	},
});
