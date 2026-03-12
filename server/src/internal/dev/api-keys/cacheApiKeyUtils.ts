import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "../../../external/redis/initRedis.js";
import {
	tryRedisRead,
	tryRedisWrite,
} from "../../../utils/cacheUtils/cacheUtils.js";

export const SECRET_KEY_CACHE_TTL_SECONDS = 3600;

export const buildSecretKeyCacheKey = (key: string) => {
	return `secret_key:${key}`;
};

export const getCachedSecretKeyVerification = async <T>({
	hashedKey,
}: {
	hashedKey: string;
}) => {
	const cacheKey = buildSecretKeyCacheKey(hashedKey);
	const cached = await tryRedisRead(() => redis.get(cacheKey));

	if (!cached) {
		return null;
	}

	return JSON.parse(cached) as T;
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

	await tryRedisWrite(() =>
		redis.set(cacheKey, JSON.stringify(data), "EX", ttl),
	);
};

export const clearSecretKeyCache = async ({
	hashedKey,
	logger = console,
}: {
	hashedKey: string;
	logger?: Pick<Console, "error" | "warn">;
}) => {
	const cacheKey = buildSecretKeyCacheKey(hashedKey);
	const deletePromises = getConfiguredRegions().map(async (region) => {
		const regionalRedis = getRegionalRedis(region);

		if (regionalRedis.status !== "ready") {
			logger.warn(`[clearSecretKeyCache] ${region}: not_ready`);
			return;
		}

		const deleted = await tryRedisWrite(
			() => regionalRedis.del(cacheKey),
			regionalRedis,
		);

		if (deleted === null) {
			logger.warn(`[clearSecretKeyCache] ${region}: delete_failed`);
		}
	});

	await Promise.all(deletePromises);
};
