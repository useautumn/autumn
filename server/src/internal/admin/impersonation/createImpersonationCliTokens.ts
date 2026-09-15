import crypto from "node:crypto";
import { prefixOAuthToken } from "@autumn/auth";
import { AUTUMN_ADMIN_OAUTH_CLIENT_ID } from "@autumn/auth/oauth";
import { AppEnv, oauthAccessToken, oauthConsent } from "@autumn/shared";
import { hashOAuthToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import { ms } from "@autumn/shared/utils/common/unixUtils";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

export const IMPERSONATION_CLI_CONSENT_KIND = "impersonation_cli";
const ACCESS_TOKEN_TTL_MS = ms.hours(1);

const insertTokenForEnv = async ({
	db,
	env,
	expiresAt,
	impersonatedBy,
	orgId,
	scopes,
	userId,
}: {
	db: DrizzleCli;
	env: AppEnv;
	expiresAt: Date;
	impersonatedBy: string;
	orgId: string;
	scopes: string[];
	userId: string;
}) => {
	const now = new Date();
	const consentId = generateId("oauth_consent");
	const rawToken = crypto.randomBytes(48).toString("base64url");

	await db.transaction(async (tx) => {
		await tx.insert(oauthConsent).values({
			id: consentId,
			clientId: AUTUMN_ADMIN_OAUTH_CLIENT_ID,
			userId,
			referenceId: orgId,
			scopes,
			env,
			metadata: { kind: IMPERSONATION_CLI_CONSENT_KIND, impersonatedBy },
			createdAt: now,
			updatedAt: now,
		});
		// No refresh row: the token lives exactly one access-token lifetime.
		await tx.insert(oauthAccessToken).values({
			id: generateId("oauth_access"),
			token: hashOAuthToken(rawToken),
			clientId: AUTUMN_ADMIN_OAUTH_CLIENT_ID,
			userId,
			referenceId: orgId,
			oauthConsentId: consentId,
			expiresAt,
			createdAt: now,
			scopes,
		});
	});

	return prefixOAuthToken({ token: rawToken });
};

/** One-hour sandbox + live tokens on the reserved admin client, attributed to the staff user. */
export const createImpersonationCliTokens = async ({
	db,
	impersonatedBy,
	orgId,
	scopes,
	userId,
}: {
	db: DrizzleCli;
	impersonatedBy: string;
	orgId: string;
	scopes: string[];
	userId: string;
}) => {
	const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
	const mint = (env: AppEnv) =>
		insertTokenForEnv({
			db,
			env,
			expiresAt,
			impersonatedBy,
			orgId,
			scopes,
			userId,
		});

	return {
		sandboxToken: await mint(AppEnv.Sandbox),
		liveToken: await mint(AppEnv.Live),
		expiresAt,
	};
};
