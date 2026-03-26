import type { OrgRedisConfig } from "@autumn/shared";
import type { Redis } from "ioredis";
import { getRegionalRedis, redis } from "./initRedis.js";
import { getOrgRedis, type OrgWithRedisConfig } from "./orgRedisPool.js";

/** Deterministic bucket (0-99) for a customer ID */
export const getCustomerBucket = (customerId: string): number =>
	Number(BigInt(Bun.hash(customerId)) % 100n);

/** Resolves the correct Redis instance for a customer based on org config, migration bucket, and region.
 *  - Org with redis_config + customer bucket on dedicated → org Redis (region ignored)
 *  - Org with redis_config + customer bucket on master → falls through to region-aware master
 *  - No redis_config or no customerId → region-aware master
 *  - region provided → getRegionalRedis(region)
 *  - Otherwise → master Redis singleton
 */
export const resolveRedisForCustomer = ({
	org,
	customerId,
	region,
}: {
	org: OrgWithRedisConfig;
	customerId?: string;
	region?: string | null;
}): Redis => {
	if (org.redis_config && customerId) {
		if (org.redis_config.migrationPercent >= 100) return getOrgRedis({ org });
		if (org.redis_config.migrationPercent > 0) {
			const bucket = getCustomerBucket(customerId);
			if (bucket < org.redis_config.migrationPercent)
				return getOrgRedis({ org });
		}
	}

	if (region) return getRegionalRedis(region);
	return redis;
};

/** Returns the org Redis URL if this customer routes to the dedicated instance,
 *  or undefined if the customer routes to master. Mirrors resolveRedisForCustomer
 *  logic so logs reflect the actual Redis used for a given customer.
 */
export const getRedisUrlForCustomer = ({
	org,
	customerId,
}: {
	org: OrgWithRedisConfig;
	customerId?: string;
}): string | undefined => {
	if (!org.redis_config || !customerId) return undefined;
	if (org.redis_config.migrationPercent >= 100) return org.redis_config.url;
	if (org.redis_config.migrationPercent <= 0) return undefined;

	const bucket = getCustomerBucket(customerId);
	return bucket < org.redis_config.migrationPercent
		? org.redis_config.url
		: undefined;
};

/** Checks if a cache entry is stale due to a migration percent change.
 *  Returns true only if the customer's routing actually changed between
 *  previousMigrationPercent and current migrationPercent, AND the entry
 *  was cached before that change.
 */
export const isCacheStale = ({
	cachedAt,
	customerId,
	redisConfig,
}: {
	cachedAt?: number;
	customerId?: string;
	redisConfig?: OrgRedisConfig | null;
}): boolean => {
	if (!redisConfig?.migrationChangedAt) return false;

	if (!customerId) return false;
	if (cachedAt && cachedAt >= redisConfig.migrationChangedAt) return false;

	const bucket = getCustomerBucket(customerId);
	const wasOnDedicated = bucket < redisConfig.previousMigrationPercent;
	const isOnDedicated = bucket < redisConfig.migrationPercent;
	return wasOnDedicated !== isOnDedicated;
};
