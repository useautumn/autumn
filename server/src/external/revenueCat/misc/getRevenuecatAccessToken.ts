import {
	AppEnv,
	type Organization,
	type RevenueCatOAuthConfig,
	type RevenueCatProcessorConfig,
} from "@autumn/shared";
import { OAuth2RequestError } from "arctic";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { acquireLockWithWait } from "@/external/redis/utils/lockUtils/acquireLockWithWait.js";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import { revenuecatAuthError } from "@/external/revenueCat/misc/revenuecatAuthError.js";
import { refreshRcTokens } from "@/external/revenueCat/misc/revenuecatOAuth.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";

const TOKEN_EXPIRY_SKEW_MS = 60_000;

const getOAuthConfigForEnv = ({
	revenueCatConfig,
	env,
}: {
	revenueCatConfig: RevenueCatProcessorConfig;
	env: AppEnv;
}): RevenueCatOAuthConfig | undefined =>
	env === AppEnv.Live ? revenueCatConfig.oauth : revenueCatConfig.sandbox_oauth;

const REFRESH_LOCK_TTL_MS = 10_000;
const REFRESH_LOCK_MAX_WAIT_MS = 5_000;

const persistOAuthTokens = async ({
	db,
	org,
	env,
	oauthConfig,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	oauthConfig: RevenueCatOAuthConfig;
}) => {
	const existing = org.processor_configs?.revenuecat || {};

	await OrgService.update({
		db,
		orgId: org.id,
		updates: {
			processor_configs: {
				...org.processor_configs,
				revenuecat: {
					...existing,
					...(env === AppEnv.Live
						? { oauth: oauthConfig }
						: { sandbox_oauth: oauthConfig }),
				},
			},
		},
	});
};

const isOAuthAccessTokenValid = (oauthConfig: RevenueCatOAuthConfig) =>
	oauthConfig.expires_at - TOKEN_EXPIRY_SKEW_MS > Date.now();

// RC revokes the old token pair on every refresh, so concurrent refreshes invalidate each other.
const withRefreshLock = async <T>({
	org,
	env,
	fn,
}: {
	org: Organization;
	env: AppEnv;
	fn: () => Promise<T>;
}): Promise<T> => {
	const lockKey = `revenuecat_oauth_refresh:${org.id}:${env}`;
	const token = crypto.randomUUID();

	await acquireLockWithWait({
		lockKey,
		token,
		ttlMs: REFRESH_LOCK_TTL_MS,
		maxWaitMs: REFRESH_LOCK_MAX_WAIT_MS,
		retryMs: 100,
		retryJitterMs: 50,
		errorMessage:
			"RevenueCat token refresh in progress, try again in a few seconds",
	});

	try {
		return await fn();
	} finally {
		await clearLock({ lockKey, token });
	}
};

const refreshRcTokensOrThrow = async ({
	refreshToken,
}: {
	refreshToken: string;
}) => {
	try {
		return await refreshRcTokens({ refreshToken });
	} catch (error) {
		if (error instanceof OAuth2RequestError && error.code === "invalid_grant") {
			throw revenuecatAuthError({ detail: "refresh token is no longer valid" });
		}
		throw error;
	}
};

/** Refresh under a per-org/env lock, re-reading the stored tokens so waiters reuse the holder's result. */
const refreshAndPersistTokens = async ({
	db,
	org,
	env,
	force,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	force: boolean;
}): Promise<string | null> =>
	withRefreshLock({
		org,
		env,
		fn: async () => {
			const latestOrg = await OrgService.get({ db, orgId: org.id });
			const oauthConfig = getOAuthConfigForEnv({
				revenueCatConfig: latestOrg.processor_configs?.revenuecat ?? {},
				env,
			});
			if (!oauthConfig) return null;

			if (!force && isOAuthAccessTokenValid(oauthConfig)) {
				return decryptData(oauthConfig.access_token);
			}

			const tokens = await refreshRcTokensOrThrow({
				refreshToken: decryptData(oauthConfig.refresh_token),
			});

			const refreshedOAuthConfig: RevenueCatOAuthConfig = {
				...oauthConfig,
				access_token: encryptData(tokens.accessToken()),
				refresh_token: encryptData(tokens.refreshToken()),
				expires_at: tokens.accessTokenExpiresAt().getTime(),
				...(tokens.hasScopes() ? { scope: tokens.scopes().join(" ") } : {}),
			};

			await persistOAuthTokens({
				db,
				org: latestOrg,
				env,
				oauthConfig: refreshedOAuthConfig,
			});
			return tokens.accessToken();
		},
	});

/**
 * Force-refresh the env's OAuth access token, persisting the rotated refresh token for us.
 * Returns the fresh access token, or null if the org isn't OAuth-connected for this env.
 * Used to hand a platform master a usable access token WITHOUT exposing the refresh token —
 * so they can't rotate it and lock Autumn out.
 */
export const refreshRevenuecatOAuthAccessToken = async ({
	db,
	org,
	env,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
}): Promise<string | null> => {
	const oauthConfig = getOAuthConfigForEnv({
		revenueCatConfig: org.processor_configs?.revenuecat ?? {},
		env,
	});
	if (!oauthConfig) return null;
	return refreshAndPersistTokens({ db, org, env, force: true });
};

export const getRevenuecatAccessToken = async ({
	db,
	org,
	env,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
}): Promise<string | null> => {
	const revenueCatConfig = org.processor_configs?.revenuecat;
	if (!revenueCatConfig) return null;

	const oauthConfig = getOAuthConfigForEnv({ revenueCatConfig, env });

	if (oauthConfig) {
		if (isOAuthAccessTokenValid(oauthConfig)) {
			return decryptData(oauthConfig.access_token);
		}

		return refreshAndPersistTokens({ db, org, env, force: false });
	}

	const apiKey =
		env === AppEnv.Live
			? revenueCatConfig.api_key
			: revenueCatConfig.sandbox_api_key;

	return apiKey ? decryptData(apiKey) : null;
};

export const getRevenuecatProjectId = ({
	revenueCatConfig,
	env,
}: {
	revenueCatConfig: RevenueCatProcessorConfig;
	env: AppEnv;
}): string | undefined => {
	const oauthConfig = getOAuthConfigForEnv({ revenueCatConfig, env });

	if (oauthConfig?.project_id) {
		return oauthConfig.project_id;
	}

	return env === AppEnv.Live
		? revenueCatConfig.project_id
		: revenueCatConfig.sandbox_project_id;
};
