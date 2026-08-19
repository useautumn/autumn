import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	isUnrestrictedChatOAuthConsent,
} from "@autumn/auth/oauth";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthConsentRepo } from "../../repos/index.js";
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
		return await resolveEmptyScopeGrant({ db, isMcpClient, tokenRecord });
	}

	if (tokenRecord.clientId === AUTUMN_ADMIN_OAUTH_CLIENT_ID) {
		// Admin grants are not consent-narrowed, but an empty request must not blank them.
		return requestedScopes?.length ? requestedScopes : tokenRecord.scopes;
	}

	// Throws rather than returning an empty grant, so the issued scopes are never blank.
	return await getOAuthConsentScopeGrant({
		db,
		organizationId: tokenRecord.referenceId,
		requestedScopes: requestedScopes ?? tokenRecord.scopes,
		userId: tokenRecord.userId,
	});
};
