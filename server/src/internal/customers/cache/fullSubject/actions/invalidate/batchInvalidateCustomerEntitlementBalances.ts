import type { Redis } from "ioredis";
import { isRedisReadyWithStandby } from "@/external/redis/initUtils/standbyRedis.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import { AGGREGATED_BALANCE_FIELD } from "../../config/fullSubjectCacheConfig.js";

export type CustomerEntitlementBalanceInvalidation = {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	customerEntitlementId: string;
};

/**
 * Pipelined variant of invalidateCustomerEntitlementBalance: one HDEL per
 * entry (cusEnt field + aggregated field), executed in a single round trip.
 * Callers must group entries per routed redis client — and keep each call
 * org-scoped so a cluster pipeline stays within one key slot (same rule as
 * batchDeleteCachedFullCustomers).
 */
export const batchInvalidateCustomerEntitlementBalances = async ({
	redisV2,
	invalidations,
}: {
	redisV2: Redis;
	invalidations: CustomerEntitlementBalanceInvalidation[];
}): Promise<void> => {
	if (!isRedisReadyWithStandby(redisV2)) return;

	const pipeline = redisV2.pipeline();
	let queued = 0;

	for (const invalidation of invalidations) {
		const { orgId, env, customerId, featureId, customerEntitlementId } =
			invalidation;
		if (!orgId || !env || !customerId || !featureId || !customerEntitlementId) {
			continue;
		}

		pipeline.hdel(
			buildSharedFullSubjectBalanceKey({ orgId, env, customerId, featureId }),
			customerEntitlementId,
			AGGREGATED_BALANCE_FIELD,
		);
		queued++;
	}

	if (queued === 0) return;

	await tryRedisWrite(() => pipeline.exec(), redisV2);
};
