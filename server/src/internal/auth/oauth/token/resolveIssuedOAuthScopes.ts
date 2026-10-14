import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	isUnrestrictedChatOAuthConsent,
} from "@autumn/auth/oauth";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthConsentRepo } from "../../repos/index.js";
import type { OAuthAccessTokenRecord } from "../oauthAccessTokenApiKey.js";
import { getOAuthConsentScopeGrant } from "../oauthConsentScopes.js";

const allowsScopeLessOAuthToken = async ({
	db,
	oauthConsentId,
}: {
	db: DrizzleCli;
	oauthConsentId: string | null;
}) => {
	if (!oauthConsentId) return false;

	const metadata = await oauthConsentRepo.getMetadataById({
		db,
		consentId: oauthConsentId,
	});
	return isUnrestrictedChatOAuthConsent({ metadata });
};

const resolveEmptyScopeGrant = async ({
	db,
	isMcpClient,
	tokenRecord,
}: {
	db: DrizzleCli;
	isMcpClient: boolean;
	tokenRecord: OAuthAccessTokenRecord;
}): Promise<string[]> => {
	if (
		isMcpClient &&
		(await allowsScopeLessOAuthToken({
			db,
			oauthConsentId: tokenRecord.oauthConsentId ?? null,
		}))
	) {
		return [];
	}

	throw new RecaseError({
		message: "OAuth token has no scopes",
		code: ErrCode.InvalidRequest,
	});
};

export const resolveIssuedOAuthScopes = async ({
	db,
	isMcpClient,
	requestedScopes,
	tokenRecord,
}: {
	db: DrizzleCli;
	isMcpClient: boolean;
	requestedScopes: string[] | null;
	tokenRecord: OAuthAccessTokenRecord;
}): Promise<string[]> => {
	if (tokenRecord.scopes.length === 0) {
		return await resolveEmptyScopeGrant({ db, isMcpClient, tokenRecord });
	}

	if (tokenRecord.clientId === AUTUMN_ADMIN_OAUTH_CLIENT_ID) {
		return requestedScopes?.length ? requestedScopes : tokenRecord.scopes;
	}

	return await getOAuthConsentScopeGrant({
		db,
		organizationId: tokenRecord.referenceId,
		requestedScopes: requestedScopes ?? tokenRecord.scopes,
		userId: tokenRecord.userId,
	});
};
