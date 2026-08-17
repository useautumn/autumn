import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND,
} from "@autumn/auth/oauth";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthConsentRepo } from "../../repos/oauthConsentRepo.js";
import type { OAuthAccessTokenRecord } from "../oauthAccessTokenApiKey.js";
import { getOAuthConsentScopeGrant } from "../oauthConsentScopes.js";

/**
 * Scope-less chat tokens are valid only for Leaf-created unrestricted consents.
 * Empty scopes bypass route checks, so callers must also require an MCP client.
 */
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
	return metadata?.kind === UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND;
};

/**
 * Re-derives the scopes the minted token may carry, so a stale grant can never
 * outlive the permissions its consent still backs.
 */
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
		const isScopeLessChatToken =
			isMcpClient &&
			(await allowsScopeLessOAuthToken({
				db,
				oauthConsentId: tokenRecord.oauthConsentId ?? null,
			}));
		if (isScopeLessChatToken) return [];

		throw new RecaseError({
			message: "OAuth token has no scopes",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	if (tokenRecord.clientId === AUTUMN_ADMIN_OAUTH_CLIENT_ID) {
		return requestedScopes ?? tokenRecord.scopes;
	}

	return getOAuthConsentScopeGrant({
		db,
		organizationId: tokenRecord.referenceId,
		requestedScopes: requestedScopes ?? tokenRecord.scopes,
		userId: tokenRecord.userId,
	});
};
