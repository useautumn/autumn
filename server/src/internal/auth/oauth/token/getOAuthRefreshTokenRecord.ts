import { hashOAuthToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthRefreshTokenRepo } from "../../repos/oauthRefreshTokenRepo.js";
import { getRefreshTokenForConsentLookup } from "../tokenRequestFields.js";

/** The row behind a `refresh_token` grant; null for every other grant type. */
export const getOAuthRefreshTokenRecord = async ({
	db,
	request,
}: {
	db: DrizzleCli;
	request: Request;
}) => {
	const refreshToken = await getRefreshTokenForConsentLookup(request);
	if (!refreshToken) return null;

	const hashedToken = await hashOAuthToken(refreshToken);
	return oauthRefreshTokenRepo.getByTokenValues({
		db,
		tokenValues: [...new Set([hashedToken, refreshToken])],
	});
};
