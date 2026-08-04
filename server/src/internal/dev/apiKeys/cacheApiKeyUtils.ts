import { miscRedis } from "../../../external/redis/initRedis.js";
import { tryRedisOp } from "../../../external/redis/utils/runRedisOp.js";
import type { ApiKeyVerificationData } from "../repos/getApiKeyVerificationData.js";

export const SECRET_KEY_CACHE_TTL_SECONDS = 3600;

export const buildSecretKeyCacheKey = (key: string) => {
	return `secret_key:${key}`;
};

export const getCachedSecretKeyVerification = async ({
	hashedKey,
}: {
	hashedKey: string;
}): Promise<ApiKeyVerificationData | null> => {
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
}: {
	hashedKey: string;
	data: unknown;
	ttl?: number;
}) => {
	const cacheKey = buildSecretKeyCacheKey(hashedKey);

	await tryRedisOp({
		operation: () => miscRedis.set(cacheKey, JSON.stringify(data), "EX", ttl),
		source: "secret-key-cache:set",
		redisInstance: miscRedis,
	});
};

export const clearSecretKeyCache = async ({
	hashedKey,
	logger = console,
}: {
	hashedKey: string;
	logger?: Pick<Console, "error" | "warn">;
}) => {
	const cacheKey = buildSecretKeyCacheKey(hashedKey);

	await tryRedisOp({
		operation: () => miscRedis.del(cacheKey),
		source: "secret-key-cache:clear",
		redisInstance: miscRedis,
		onError: () => {
			logger.warn("[clearSecretKeyCache] delete_failed");
		},
	});
};
