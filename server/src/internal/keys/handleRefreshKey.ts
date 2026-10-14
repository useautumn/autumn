import { ErrCode, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { mintTokenPair } from "@/internal/auth/customerJwt.js";
import {
	bumpEpoch,
	readFamily,
	setFamily,
} from "@/internal/auth/customerJwtEpoch.js";
import RecaseError from "@/utils/errorUtils.js";

export const handleRefreshKey = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const claim = ctx.customerJwt;
		if (!claim) {
			throw new RecaseError({
				message: "Missing customer token",
				code: ErrCode.InvalidRequest,
				statusCode: 401,
			});
		}

		const family = await readFamily({
			internalCustomerId: claim.internalCustomerId,
		});
		const epoch = family?.epoch ?? 0;
		const current = family?.refreshKid ?? 0;
		const presented = claim.refreshKid;

		const writeKey = {
			internalCustomerId: claim.internalCustomerId,
			orgId: ctx.org.id,
			env: ctx.env,
		};

		let refreshKid: number;
		if (presented === current) {
			refreshKid = current + 1;
			await setFamily({ ...writeKey, epoch, refreshKid });
		} else if (presented === current - 1) {
			refreshKid = current;
			await setFamily({ ...writeKey, epoch, refreshKid });
		} else {
			await bumpEpoch(writeKey);
			throw new RecaseError({
				message: "Refresh token reuse detected",
				code: ErrCode.InvalidRequest,
				statusCode: 401,
			});
		}

		const pair = await mintTokenPair({
			customerId: claim.customerId,
			internalCustomerId: claim.internalCustomerId,
			env: ctx.env,
			epoch,
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
