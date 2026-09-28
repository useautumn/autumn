import {
	AppEnv,
	type Organization,
	type RevenueCatOAuthConfig,
	type RevenueCatProcessorConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { isLockConflict } from "@/external/redis/utils/lockUtils/acquireLock.js";
import { acquireLockWithWait } from "@/external/redis/utils/lockUtils/acquireLockWithWait.js";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import { refreshRcTokens } from "@/external/revenueCat/misc/revenuecatOAuth.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { orgRepo } from "@/internal/orgs/repos/index.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";

const TOKEN_EXPIRY_SKEW_MS = 60_000;
const REFRESH_LOCK_TTL_MS = 10_000;
const REFRESH_LOCK_WAIT_MS = 12_000;

const getOAuthConfigForEnv = ({
	revenueCatConfig,
	env,
}: {
	revenueCatConfig: RevenueCatProcessorConfig;
	env: AppEnv;
}): RevenueCatOAuthConfig | undefined =>
	env === AppEnv.Live ? revenueCatConfig.oauth : revenueCatConfig.sandbox_oauth;

const isOAuthAccessTokenValid = (oauthConfig: RevenueCatOAuthConfig) =>
	oauthConfig.expires_at - TOKEN_EXPIRY_SKEW_MS > Date.now();

const readStoredOAuthConfig = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}): Promise<RevenueCatOAuthConfig | undefined> => {
	const org = await OrgService.get({ db, orgId });
	return getOAuthConfigForEnv({
		revenueCatConfig: org.processor_configs?.revenuecat ?? {},
		env,
	});
};

const readValidStoredAccessToken = async (params: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}): Promise<string | null> => {
	const stored = await readStoredOAuthConfig(params);
	return stored && isOAuthAccessTokenValid(stored)
		? decryptData(stored.access_token)
		: null;
};

/** Rotate the stored pair and return the fresh access token.
 *  RC revokes the old pair on every refresh, so rotation is serialized per org+env and compare-and-swapped. */
const refreshAndPersistTokens = async ({
	db,
	orgId,
	env,
	force = false,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	force?: boolean;
}): Promise<string | null> => {
	const lockKey = `revenuecat:oauth-refresh:${orgId}:${env}`;
	const lockToken = crypto.randomUUID();

	try {
		await acquireLockWithWait({
			lockKey,
			ttlMs: REFRESH_LOCK_TTL_MS,
			maxWaitMs: REFRESH_LOCK_WAIT_MS,
			token: lockToken,
			errorMessage: "RevenueCat token refresh already in progress",
		});
	} catch (error) {
		if (!isLockConflict(error)) throw error;
		const stored = await readValidStoredAccessToken({ db, orgId, env });
		if (stored) return stored;
		throw error;
	}

	try {
		const stored = await readStoredOAuthConfig({ db, orgId, env });
		if (!stored) return null;
		if (!force && isOAuthAccessTokenValid(stored)) {
			return decryptData(stored.access_token);
		}

		const tokens = await refreshRcTokens({
			refreshToken: decryptData(stored.refresh_token),
		});
		const swapped = await orgRepo.swapRevenueCatOAuth({
			db,
			orgId,
			env,
			expectedRefreshToken: stored.refresh_token,
			oauthConfig: {
				...stored,
				access_token: encryptData(tokens.accessToken()),
				refresh_token: encryptData(tokens.refreshToken()),
				expires_at: tokens.accessTokenExpiresAt().getTime(),
				...(tokens.hasScopes() ? { scope: tokens.scopes().join(" ") } : {}),
			},
		});

		if (!swapped) {
			const latest = await readStoredOAuthConfig({ db, orgId, env });
			return latest ? decryptData(latest.access_token) : null;
		}

		await clearOrgCache({ db, orgId });
		return tokens.accessToken();
	} finally {
		await clearLock({ lockKey, token: lockToken });
	}
};

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
	return refreshAndPersistTokens({ db, orgId: org.id, env, force: true });
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

		return refreshAndPersistTokens({ db, orgId: org.id, env });
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
