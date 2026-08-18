import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	oauthAccessTokenRepo,
	oauthRefreshTokenRepo,
} from "../../repos/index.js";

/**
 * Writes the reissued scopes, resolved consent and audience back onto the access
 * and refresh rows, so a partial write can never split one grant across two states.
 */
export const persistOAuthTokenGrant = async ({
	accessTokenId,
	db,
	oauthConsentId,
	refreshTokenId,
	resource,
	scopes,
}: {
	accessTokenId?: string | null;
	db: DrizzleCli;
	oauthConsentId: string | null;
	refreshTokenId?: string | null;
	resource: string | null;
	scopes: string[];
}) => {
	if (!accessTokenId && !refreshTokenId) return;

	await db.transaction(async (tx) => {
		if (accessTokenId) {
			await oauthAccessTokenRepo.updateGrant({
				db: tx,
				id: accessTokenId,
				oauthConsentId,
				resource,
				scopes,
			});
		}

		if (refreshTokenId) {
			await oauthRefreshTokenRepo.updateGrant({
				db: tx,
				id: refreshTokenId,
				oauthConsentId,
				resource,
				scopes,
			});
		}
	});
};
