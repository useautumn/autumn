import { logger } from "@/external/logtail/logtailUtils.js";
import {
	forEachMiscRedisTarget,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { ApiKeyVerificationData } from "@/internal/dev/repos/getApiKeyVerificationData.js";

export const SECRET_KEY_CACHE_TTL_SECONDS = 3600;

export const buildSecretKeyCacheKey = (key: string) => {
	return `secret_key:${key}`;
};

export const getCachedSecretKeyVerification = async ({
	hashedKey,
	requestId,
}: {
	hashedKey: string;
	requestId?: string;
}): Promise<ApiKeyVerificationData | null> => {
	const miscRedis = resolveMiscRedis({ requestId });
	const cacheKey = buildSecretKeyCacheKey(hashedKey);

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "secret-key-cache:get",
		redisInstance: miscRedis,
	});

	if (!cached) {
		return null;
	}

	return JSON.parse(cached) as ApiKeyVerificationData;
};

export const setCachedSecretKeyVerification = async ({
	hashedKey,
	data,
	ttl = SECRET_KEY_CACHE_TTL_SECONDS,
	requestId,
}: {
	hashedKey: string;
	data: unknown;
	ttl?: number;
	requestId?: string;
}) => {
	const miscRedis = resolveMiscRedis({ requestId });
	const cacheKey = buildSecretKeyCacheKey(hashedKey);

	await tryRedisOp({
		operation: () => miscRedis.set(cacheKey, JSON.stringify(data), "EX", ttl),
		source: "secret-key-cache:set",
		redisInstance: miscRedis,
	});
};

/** Drop the cached verification on every live instance — ramped readers must
 *  never accept a revoked key. */
export const clearSecretKeyCache = async ({
	hashedKey,
}: {
	hashedKey: string;
}) => {
	const cacheKey = buildSecretKeyCacheKey(hashedKey);

	await forEachMiscRedisTarget({
		operation: ({ redis }) =>
			tryRedisOp({
				operation: () => redis.del(cacheKey),
				source: "secret-key-cache:clear",
				redisInstance: redis,
			}),
		onError: ({ target }) => {
			logger.warn(`[secretKeyCache] clear failed on "${target.instanceName}"`);
		},
	});
};
