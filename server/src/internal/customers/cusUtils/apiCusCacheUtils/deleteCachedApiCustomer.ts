import { redis } from "../../../../external/redis/initRedis.js";
import { buildCachedApiCustomerKey } from "./getCachedApiCustomer.js";

/**
 * Delete all cached ApiCustomer data from Redis
 * This includes the base customer key and all related feature/breakdown/rollover keys
 */
export const deleteCachedApiCustomer = async ({
	customerId,
	orgId,
	env,
}: {
	customerId: string;
	orgId: string;
	env: string;
}): Promise<void> => {
	const cacheKey = buildCachedApiCustomerKey({
		customerId,
		orgId,
		env,
	});

	// Delete all keys matching the pattern: cacheKey*
	// This includes:
	// - Base customer key: orgId:env:customer:customerId
	// - Feature keys: orgId:env:customer:customerId:features:featureId
	// - Breakdown keys: orgId:env:customer:customerId:features:featureId:breakdown:index
	// - Rollover keys: orgId:env:customer:customerId:features:featureId:rollover:index

	// Use SCAN to find all matching keys (safer than KEYS in production)
	const pattern = `${cacheKey}*`;
	const keys: string[] = [];

	let cursor = "0";
	do {
		const [nextCursor, foundKeys] = (await redis.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			100,
		)) as [string, string[]];

		cursor = nextCursor;
		keys.push(...foundKeys);
	} while (cursor !== "0");

	// Delete all found keys in a single pipeline for efficiency
	if (keys.length > 0) {
		const pipeline = redis.pipeline();
		for (const key of keys) {
			pipeline.del(key);
		}
		await pipeline.exec();
	}
};
