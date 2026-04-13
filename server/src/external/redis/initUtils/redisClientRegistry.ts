import type { Redis } from "ioredis";
import { createRedisClient } from "./createRedisClient.js";
import {
	currentRegion,
	getCacheUrlForRegion,
	PRIMARY_REGION,
	primaryCacheUrl,
} from "./redisConfig.js";

if (process.env.CACHE_BACKUP_URL?.trim()) {
	console.log(
		`[Redis] Using CACHE_BACKUP_URL for all regions (primary region: ${currentRegion})`,
	);
} else if (primaryCacheUrl && getCacheUrlForRegion({ region: currentRegion })) {
	console.log(`Using regional cache: ${currentRegion}`);
}

const primaryRedis = createRedisClient({
	cacheUrl: primaryCacheUrl!,
	region: currentRegion,
});

/**
 * The active Redis instance. All consumer code imports this.
 * Normally points to the primary (current region).
 */
export const redis: Redis = primaryRedis;

// Lazy-loaded regional Redis instances for cross-region sync
const regionalRedisInstances: Map<string, Redis> = new Map();

/** Get Redis instance for a specific region (lazy-loaded) */
export const getRegionalRedis = (region: string): Redis => {
	if (region === currentRegion) {
		return primaryRedis;
	}

	const cacheUrl = getCacheUrlForRegion({ region });

	if (!cacheUrl) {
		console.warn(
			`No cache URL configured for region ${region}, falling back to primary`,
		);
		return primaryRedis;
	}

	if (cacheUrl === primaryCacheUrl) {
		return primaryRedis;
	}

	let regionalInstance = regionalRedisInstances.get(region);
	if (regionalInstance) {
		return regionalInstance;
	}

	console.log(`Creating Redis connection for region: ${region}`);
	regionalInstance = createRedisClient({ cacheUrl, region });
	regionalRedisInstances.set(region, regionalInstance);

	return regionalInstance;
};

/** Get the primary Redis instance (us-west-2) to avoid replication lag issues */
export const getPrimaryRedis = () => getRegionalRedis(PRIMARY_REGION);
