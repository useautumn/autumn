import crypto from "node:crypto";
import type { AppEnv } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils";

const PRODUCTS_CACHE_PREFIX = "products_full";

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

/** Builds the base cache key prefix for products list (without query hash) */
export const buildProductsCacheKeyPrefix = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => {
	return `${PRODUCTS_CACHE_PREFIX}:${orgId}:${env}`;
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

/** Invalidates all products cache entries for an org/env (wildcard delete) */
export const invalidateProductsCache = async ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => {
	const pattern = `${buildProductsCacheKeyPrefix({ orgId, env })}:*`;

	await tryRedisWrite(async () => {
		// Use SCAN to find all matching keys, then delete them
		const keys: string[] = [];
		let cursor = "0";

		do {
			const [newCursor, foundKeys] = await redis.scan(
				cursor,
				"MATCH",
				pattern,
				"COUNT",
				100,
			);
			cursor = newCursor;
			keys.push(...foundKeys);
		} while (cursor !== "0");

		if (keys.length > 0) {
			await redis.del(...keys);
		}
	});
};
