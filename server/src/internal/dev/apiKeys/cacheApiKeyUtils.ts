import { LRUCache } from "lru-cache";
import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "../../../external/redis/initRedis.js";
import { REDIS_OP_TIMEOUT_MS } from "../../../external/redis/utils/redisOpTimeouts.js";
import { tryRedisOp } from "../../../external/redis/utils/runRedisOp.js";
import type { ApiKeyVerificationData } from "../repos/getApiKeyVerificationData.js";

export const SECRET_KEY_CACHE_TTL_SECONDS = 3600;

// This TTL is the revocation window: clearSecretKeyCache only reaches the
// calling process's L1, so every other worker serves a revoked key until it lapses.
export const SECRET_KEY_L1_TTL_MS = 5_000;
export const SECRET_KEY_L1_NEGATIVE_TTL_MS = 1_000;
export const SECRET_KEY_L1_MAX_ENTRIES = 5_000;

type SecretKeyL1Entry = { value: ApiKeyVerificationData | null };

/** Per-process L1. Each cluster worker gets its own copy — intended. */
const secretKeyL1 = new LRUCache<string, SecretKeyL1Entry>({
	max: SECRET_KEY_L1_MAX_ENTRIES,
	ttl: SECRET_KEY_L1_TTL_MS,
});

export const _resetSecretKeyL1ForTesting = () => secretKeyL1.clear();
export const _secretKeyL1SizeForTesting = () => secretKeyL1.size;

export const buildSecretKeyCacheKey = (key: string) => {
	return `secret_key:${key}`;
};

export const getCachedSecretKeyVerification = async ({
	hashedKey,
}: {
	hashedKey: string;
}): Promise<ApiKeyVerificationData | null> => {
	const cacheKey = buildSecretKeyCacheKey(hashedKey);

	const local = secretKeyL1.get(cacheKey);
	if (local) return local.value;

	const cached = await tryRedisOp({
		operation: () => redis.get(cacheKey),
		source: "secret-key-cache:get",
		timeoutMs: REDIS_OP_TIMEOUT_MS.secretKeyGet,
	});

	// `undefined` means Redis failed, `null` means a genuine miss — only the
	// latter is a real answer worth negative-caching.
	if (cached === undefined) return null;

	if (!cached) {
		secretKeyL1.set(
			cacheKey,
			{ value: null },
			{ ttl: SECRET_KEY_L1_NEGATIVE_TTL_MS },
		);
		return null;
	}

	const parsed = JSON.parse(cached) as ApiKeyVerificationData;
	secretKeyL1.set(cacheKey, { value: parsed });
	return parsed;
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

	secretKeyL1.set(cacheKey, { value: data as ApiKeyVerificationData });

	await tryRedisOp({
		operation: () => redis.set(cacheKey, JSON.stringify(data), "EX", ttl),
		source: "secret-key-cache:set",
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

	// Local-only: other processes keep serving the key until their L1 TTL lapses.
	secretKeyL1.delete(cacheKey);

	const deletePromises = getConfiguredRegions().map((region) => {
		const regionalRedis = getRegionalRedis(region);

		return tryRedisOp({
			operation: () => regionalRedis.del(cacheKey),
			source: `secret-key-cache:clear:${region}`,
			redisInstance: regionalRedis,
			onError: () => {
				logger.warn(`[clearSecretKeyCache] ${region}: delete_failed`);
			},
		});
	});

	await Promise.all(deletePromises);
};
