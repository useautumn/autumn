import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthAccessTokenRepo } from "../../repos/oauthAccessTokenRepo.js";
import { oauthRefreshTokenRepo } from "../../repos/oauthRefreshTokenRepo.js";

/** Writes the reissued scopes, resolved consent and audience back onto the access and refresh rows. */
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
	if (accessTokenId) {
		await oauthAccessTokenRepo.updateScopes({ db, id: accessTokenId, scopes });
		if (oauthConsentId) {
			await oauthAccessTokenRepo.updateConsent({
				db,
				id: accessTokenId,
				oauthConsentId,
			});
		}
		if (resource) {
			await oauthAccessTokenRepo.updateResource({
				db,
				id: accessTokenId,
				resource,
			});
		}
	}

	if (refreshTokenId) {
		await oauthRefreshTokenRepo.updateScopes({
			db,
			id: refreshTokenId,
			scopes,
		});
		if (oauthConsentId) {
			await oauthRefreshTokenRepo.updateConsent({
				db,
				id: refreshTokenId,
				oauthConsentId,
			});
		}
		if (resource) {
			await oauthRefreshTokenRepo.updateResource({
				db,
				id: refreshTokenId,
				resource,
			});
		}
	}
};
