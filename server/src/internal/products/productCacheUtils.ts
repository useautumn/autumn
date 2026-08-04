import crypto from "node:crypto";
import type { AppEnv } from "@autumn/shared";
import { miscRedis } from "@/external/redis/initRedis";

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

/** All possible archived query param values that can be cached */
const ARCHIVED_VARIANTS = [undefined, false, true] as const;

/** Invalidates all products cache entries for an org/env */
export const invalidateProductsCache = async ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
	if (miscRedis.status !== "ready") return;

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

	try {
		const deleted = await miscRedis.del(...keysToDelete);
		console.info(
			`[invalidateProductsCache] deleted ${deleted} keys, org: ${orgId}, env: ${env}`,
		);
	} catch (error) {
		console.error(
			`[invalidateProductsCache] error, org: ${orgId}, env: ${env}, error: ${error}`,
		);
	}
};
