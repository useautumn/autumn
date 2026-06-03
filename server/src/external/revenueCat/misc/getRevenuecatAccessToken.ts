import {
	AppEnv,
	type Organization,
	type RevenueCatOAuthConfig,
	type RevenueCatProcessorConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
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

/** Rotate the OAuth tokens, persist the new pair, and return the fresh access token. */
const refreshAndPersistTokens = async ({
	db,
	org,
	env,
	oauthConfig,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	oauthConfig: RevenueCatOAuthConfig;
}): Promise<string> => {
	const refreshToken = decryptData(oauthConfig.refresh_token);
	const tokens = await refreshRcTokens({ refreshToken });

	const refreshedOAuthConfig: RevenueCatOAuthConfig = {
		...oauthConfig,
		access_token: encryptData(tokens.accessToken()),
		refresh_token: encryptData(tokens.refreshToken()),
		expires_at: tokens.accessTokenExpiresAt().getTime(),
		...(tokens.hasScopes() ? { scope: tokens.scopes().join(" ") } : {}),
	};

	await persistOAuthTokens({ db, org, env, oauthConfig: refreshedOAuthConfig });
	return tokens.accessToken();
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
	return refreshAndPersistTokens({ db, org, env, oauthConfig });
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

		return refreshAndPersistTokens({ db, org, env, oauthConfig });
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
