import { getOAuthTokenValues } from "@autumn/shared/utils/auth/oauthAccessTokens";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthRefreshTokenRepo } from "../../repos/oauthRefreshTokenRepo.js";
import { getOAuthTokenRequestFields } from "../tokenRequestFields.js";

/** The row behind a `refresh_token` grant; null for every other grant type. */
export const getOAuthRefreshTokenRecord = async ({
	db,
	request,
}: {
	db: DrizzleCli;
	request: Request;
}) => {
	// Other grants carry a `refresh_token` field too (better-auth ignores it),
	// so the grant type decides whether it names the row being refreshed.
	const { grantType, refreshToken } = await getOAuthTokenRequestFields(request);
	if (grantType !== "refresh_token" || !refreshToken) return null;

	return oauthRefreshTokenRepo.getByTokenValues({
		db,
		tokenValues: getOAuthTokenValues(refreshToken),
	});
};
