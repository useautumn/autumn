import type { AppEnv, ChatInstallation } from "@autumn/shared";
import { decrypt, encrypt } from "../../../lib/crypto.js";
import { db } from "../../../lib/db.js";
import { env as leafEnv } from "../../../lib/env.js";
import {
	getChatOAuthCredentialByInstallationEnv,
	updateChatOAuthCredentialTokens,
} from "../repos/chatOAuthCredentialsRepo.js";
import {
	parseOAuthScopeString,
	parseOAuthTokenResponse,
} from "../utils/oauthTokenResponse.js";

const TOKEN_EXPIRY_SKEW_MS = 60_000;

const getTokenEndpoint = () =>
	new URL("/api/auth/oauth2/token", leafEnv.BETTER_AUTH_URL).href;

const getDefaultExpiresAt = () => Date.now() + 60 * 60 * 1000;

export const getInstallationOAuthAccessToken = async ({
	installation,
	env,
}: {
	installation: ChatInstallation;
	env: AppEnv;
}) => {
	const credential = await getChatOAuthCredentialByInstallationEnv({
		db,
		chatInstallationId: installation.id,
		env,
	});

	if (!credential) {
		throw new Error(
			`Missing ${env} Autumn OAuth credentials for Slack install`,
		);
	}

	if (credential.access_token_expires_at - TOKEN_EXPIRY_SKEW_MS > Date.now()) {
		return decrypt(credential.access_token);
	}

	const refreshToken = decrypt(credential.refresh_token);
	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		client_id: credential.oauth_client_id,
	});

	const response = await fetch(getTokenEndpoint(), {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});

	if (!response.ok) {
		throw new Error(
			`Could not refresh ${env} Autumn OAuth token for Slack install`,
		);
	}

	const parsed = parseOAuthTokenResponse({ body: await response.json() });
	const accessTokenExpiresAt = parsed.expires_in
		? Date.now() + parsed.expires_in * 1000
		: getDefaultExpiresAt();
	const nextRefreshToken = parsed.refresh_token ?? refreshToken;
	const scopes = parseOAuthScopeString({ scope: parsed.scope });

	await updateChatOAuthCredentialTokens({
		db,
		id: credential.id,
		accessToken: encrypt(parsed.access_token),
		refreshToken: encrypt(nextRefreshToken),
		accessTokenExpiresAt,
		scopes: scopes.length > 0 ? scopes : credential.scopes,
		updatedAt: Date.now(),
	});

	return parsed.access_token;
};
