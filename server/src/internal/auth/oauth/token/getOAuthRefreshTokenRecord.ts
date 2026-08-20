import { getOAuthTokenValues } from "@autumn/shared/utils/auth/oauthAccessTokens";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthRefreshTokenRepo } from "../../repos/index.js";
import type { OAuthTokenRequestFields } from "../tokenRequestFields.js";

export const getOAuthRefreshTokenRecord = async ({
	db,
	tokenRequestFields,
}: {
	db: DrizzleCli;
	tokenRequestFields: OAuthTokenRequestFields;
}) => {
	// Other grants carry a `refresh_token` field too (better-auth ignores it),
	// so the grant type decides whether it names the row being refreshed.
	const { grantType, refreshToken } = tokenRequestFields;
	if (grantType !== "refresh_token" || !refreshToken) return null;

	return oauthRefreshTokenRepo.getByTokenValues({
		db,
		tokenValues: getOAuthTokenValues(refreshToken),
	});
};
