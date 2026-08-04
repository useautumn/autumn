import crypto from "node:crypto";
import type { AppEnv } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	forEachMiscRedisTarget,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

const PRODUCTS_CACHE_PREFIX = "products_full";

/** Cache version - bump when cache schema changes to auto-invalidate old entries */
const PRODUCTS_CACHE_VERSION = "1.1.0";

/** TTL for products cache: 1 day */
export const PRODUCTS_CACHE_TTL = 60 * 60 * 24;

/** Hashes query params to create a short, consistent cache key suffix */
const hashQueryParams = (params: Record<string, unknown>): string => {
	// Filter out undefined/null values and sort keys for consistency
	const filtered = Object.entries(params)
		.filter(([_, v]) => v !== undefined && v !== null)
		.sort(([a], [b]) => a.localeCompare(b));

	if (filtered.length === 0) return "default";

	const str = JSON.stringify(filtered);
	return crypto.createHash("md5").update(str).digest("hex").slice(0, 12);
};

/**
 * Builds the base cache key prefix for products list (without query hash).
 * Uses Redis hash tag {orgId} to ensure all keys for the same org hash to the same slot,
 * enabling multi-key operations (like DEL) in Redis Cluster.
 */
export const buildProductsCacheKeyPrefix = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => {
	return `${PRODUCTS_CACHE_PREFIX}:{${orgId}}:${env}:${PRODUCTS_CACHE_VERSION}`;
};

/** Builds the cache key for products list with optional query params */
export const buildProductsCacheKey = ({
	orgId,
	env,
	queryParams,
}: {
	orgId: string;
	env: AppEnv;
	queryParams?: Record<string, unknown>;
}) => {
	const prefix = buildProductsCacheKeyPrefix({ orgId, env });
	const hash = queryParams ? hashQueryParams(queryParams) : "default";
	return `${prefix}:${hash}`;
};

/** Builds the cache key for all product versions (unfiltered, no joins) */
export const buildAllVersionsProductsCacheKey = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => {
	return `${buildProductsCacheKeyPrefix({ orgId, env })}:all_versions`;
};

export const getCachedProducts = async <T>({
	cacheKey,
	requestId,
}: {
	cacheKey: string;
	requestId?: string;
}): Promise<T | null> => {
	const miscRedis = resolveMiscRedis({ requestId });

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "products-cache:get",
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as T;
};

export const setCachedProducts = async ({
	cacheKey,
	value,
	requestId,
}: {
	cacheKey: string;
	value: unknown;
	requestId?: string;
}): Promise<void> => {
	const miscRedis = resolveMiscRedis({ requestId });

	await tryRedisOp({
		operation: () =>
			miscRedis.set(cacheKey, JSON.stringify(value), "EX", PRODUCTS_CACHE_TTL),
		source: "products-cache:set",
		redisInstance: miscRedis,
	});
};

/** All possible archived query param values that can be cached */
const ARCHIVED_VARIANTS = [undefined, false, true] as const;

/** Invalidates all products cache entries for an org/env — on every live
 *  instance, so ramped readers never serve a stale catalog. */
export const invalidateProductsCache = async ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
	// Build all possible cache keys (deterministic based on archived param variants)
	const keysToDelete = [
		...ARCHIVED_VARIANTS.map((archived) =>
			buildProductsCacheKey({
				orgId,
				env,
				queryParams: archived !== undefined ? { archived } : undefined,
			}),
		),
		buildAllVersionsProductsCacheKey({ orgId, env }),
	];

	await forEachMiscRedisTarget({
		operation: ({ redis }) =>
			tryRedisOp({
				operation: () => redis.del(...keysToDelete),
				source: "products-cache:invalidate",
				redisInstance: redis,
			}),
		onError: ({ target }) => {
			logger.warn(
				`[productsCache] invalidate failed on "${target.instanceName}" (org: ${orgId}, env: ${env})`,
			);
		},
	});
};
