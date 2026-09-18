import { LRUCache } from "lru-cache";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	forEachMiscRedisTarget,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { REDIS_OP_TIMEOUT_MS } from "@/external/redis/utils/redisOpTimeouts.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { ApiKeyVerificationData } from "@/internal/dev/repos/getApiKeyVerificationData.js";

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
	requestId,
}: {
	hashedKey: string;
	requestId?: string;
}): Promise<ApiKeyVerificationData | null> => {
	const miscRedis = resolveMiscRedis({ requestId });
	const cacheKey = buildSecretKeyCacheKey(hashedKey);

	const local = secretKeyL1.get(cacheKey);
	if (local) return local.value;

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "secret-key-cache:get",
		redisInstance: miscRedis,
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
	requestId,
}: {
	hashedKey: string;
	data: unknown;
	ttl?: number;
	requestId?: string;
}) => {
	const miscRedis = resolveMiscRedis({ requestId });
	const cacheKey = buildSecretKeyCacheKey(hashedKey);

	secretKeyL1.set(cacheKey, { value: data as ApiKeyVerificationData });

	await tryRedisOp({
		operation: () => miscRedis.set(cacheKey, JSON.stringify(data), "EX", ttl),
		source: "secret-key-cache:set",
		redisInstance: miscRedis,
		timeoutMs: REDIS_OP_TIMEOUT_MS.secretKeySet,
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

	secretKeyL1.delete(cacheKey);

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
