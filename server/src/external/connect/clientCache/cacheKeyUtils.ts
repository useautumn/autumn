import type { AppEnv } from "@autumn/shared";

/** Builds cache key for Stripe clients created via org secret key. */
export const buildSecretKeyCacheKey = ({
	orgId,
	env,
	legacyVersion,
	encryptedKey,
}: {
	orgId: string;
	env: AppEnv;
	legacyVersion?: boolean;
	encryptedKey: string;
}): string => {
	return `sk:${orgId}:${env}:${legacyVersion ? 1 : 0}:${encryptedKey.slice(0, 16)}`;
};

/** Builds cache key for Stripe clients created via Autumn's master Stripe keys (env vars). */
export const buildMasterCacheKey = ({
	env,
	accountId,
	legacyVersion,
}: {
	env?: AppEnv;
	accountId?: string;
	legacyVersion?: boolean;
}): string => {
	return `master:${env || "sandbox"}:${accountId || "none"}:${legacyVersion ? 1 : 0}`;
};

/** Builds cache key for Stripe clients created via platform (master org) flow. */
export const buildPlatformCacheKey = ({
	masterOrgId,
	env,
	accountId,
	legacyVersion,
	encryptedKey,
}: {
	masterOrgId: string;
	env: AppEnv;
	accountId?: string;
	legacyVersion?: boolean;
	encryptedKey: string;
}): string => {
	return `platform:${masterOrgId}:${env}:${accountId || "none"}:${legacyVersion ? 1 : 0}:${encryptedKey.slice(0, 16)}`;
};
