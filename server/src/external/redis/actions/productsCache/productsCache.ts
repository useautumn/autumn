import crypto from "node:crypto";
import type { AppEnv } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { forEachMiscRedisTarget } from "@/external/redis/miscCache/resolveMiscRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

const PRODUCTS_CACHE_PREFIX = "products_full";

const PRODUCTS_CACHE_VERSION = "1.1.0";

export const PRODUCTS_CACHE_TTL = 60 * 60 * 24;

const hashQueryParams = (params: Record<string, unknown>): string => {
	const filtered = Object.entries(params)
		.filter(([_, v]) => v !== undefined && v !== null)
		.sort(([a], [b]) => a.localeCompare(b));

	if (filtered.length === 0) return "default";

	const str = JSON.stringify(filtered);
	return crypto.createHash("md5").update(str).digest("hex").slice(0, 12);
};

export const buildProductsCacheKeyPrefix = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => {
	return `${PRODUCTS_CACHE_PREFIX}:{${orgId}}:${env}:${PRODUCTS_CACHE_VERSION}`;
};

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
}: {
	cacheKey: string;
}): Promise<T | null> => {
	const miscRedis = getMiscRedis();

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
}: {
	cacheKey: string;
	value: unknown;
}): Promise<void> => {
	const miscRedis = getMiscRedis();

	await tryRedisOp({
		operation: () =>
			miscRedis.set(cacheKey, JSON.stringify(value), "EX", PRODUCTS_CACHE_TTL),
		source: "products-cache:set",
		redisInstance: miscRedis,
	});
};

const ARCHIVED_VARIANTS = [undefined, false, true] as const;

export const invalidateProductsCache = async ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
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
