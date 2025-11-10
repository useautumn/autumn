import { redis } from "../../../external/redis/initRedis.js";
import { tryRedisWrite } from "../../../utils/cacheUtils/cacheUtils.js";

export const buildSecretKeyCacheKey = (key: string) => {
	return `secret_key:${key}`;
};

export const clearSecretKeyCache = async ({
	hashedKey,
}: {
	hashedKey: string;
}) => {
	const cacheKey = buildSecretKeyCacheKey(hashedKey);
	await tryRedisWrite(async () => redis.del(cacheKey));
};
