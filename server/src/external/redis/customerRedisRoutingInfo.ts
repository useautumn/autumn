import type { OrgRedisConfig } from "@autumn/shared";
import type { OrgWithRedisConfig } from "./orgRedisPool.js";

export type CustomerRedisRoutingInfo = {
	bucket?: number;
	redisUrl?: string;
	usesDedicatedRedis: boolean;
};

export const getCustomerRedisRoutingId = ({
	customer,
}: {
	customer: { id?: string | null; internal_id: string };
}): string => customer.id ?? customer.internal_id;

export const getCustomerBucket = (customerId: string): number =>
	Number(BigInt(Bun.hash(customerId)) % 100n);

export const getCustomerRedisRoutingInfoForOrg = ({
	org,
	customerId,
}: {
	org: OrgWithRedisConfig;
	customerId?: string;
}): CustomerRedisRoutingInfo => {
	if (!org.redis_config || !customerId) {
		return {
			usesDedicatedRedis: false,
		};
	}

	const bucket = getCustomerBucket(customerId);
	const usesDedicatedRedis = bucket < org.redis_config.migrationPercent;

	return {
		bucket,
		redisUrl: usesDedicatedRedis ? org.redis_config.url : undefined,
		usesDedicatedRedis,
	};
};

export const isRedisMigrationCacheStale = ({
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
	if (cachedAt === undefined) return false;
	if (cachedAt >= redisConfig.migrationChangedAt) return false;

	const bucket = getCustomerBucket(customerId);
	const wasOnDedicated = bucket < redisConfig.previousMigrationPercent;
	const isOnDedicated = bucket < redisConfig.migrationPercent;
	return wasOnDedicated !== isOnDedicated;
};
