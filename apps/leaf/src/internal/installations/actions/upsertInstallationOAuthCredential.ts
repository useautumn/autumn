import crypto from "node:crypto";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID as SHARED_ADMIN_OAUTH_CLIENT_ID,
	SLACK_MCP_OAUTH_CLIENT_ID,
	WEB_MCP_OAUTH_CLIENT_ID,
} from "@autumn/auth/oauth";
import type { AppEnv, ChatInstallation } from "@autumn/shared";
import { encrypt } from "../../../lib/crypto.js";
import { db } from "../../../lib/db.js";
import { upsertChatOAuthCredential } from "../repos/chatOAuthCredentialsRepo.js";

export const AUTUMN_SLACK_OAUTH_CLIENT_ID = SLACK_MCP_OAUTH_CLIENT_ID;
export const AUTUMN_ADMIN_OAUTH_CLIENT_ID = SHARED_ADMIN_OAUTH_CLIENT_ID;
export const AUTUMN_WEB_OAUTH_CLIENT_ID = WEB_MCP_OAUTH_CLIENT_ID;

export const upsertInstallationOAuthCredential = async ({
	installation,
	env,
	accessToken,
	refreshToken,
	accessTokenExpiresAt,
	scopes,
	oauthClientId = AUTUMN_SLACK_OAUTH_CLIENT_ID,
	oauthConsentId,
	orgId = installation.org_id,
}: {
	installation: ChatInstallation;
	env: AppEnv;
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: number;
	scopes: string[];
	oauthClientId?: string;
	oauthConsentId?: string | null;
	orgId?: string;
}) => {
	const now = Date.now();

	return upsertChatOAuthCredential({
		db,
		credential: {
			id: `chat_oauth_${crypto.randomUUID().replace(/-/g, "")}`,
			chat_installation_id: installation.id,
			org_id: orgId,
			env,
			oauth_client_id: oauthClientId,
			oauth_consent_id: oauthConsentId ?? null,
			access_token: encrypt(accessToken),
			refresh_token: encrypt(refreshToken),
			access_token_expires_at: accessTokenExpiresAt,
			scopes,
			created_at: now,
			updated_at: now,
		},
	});
};
