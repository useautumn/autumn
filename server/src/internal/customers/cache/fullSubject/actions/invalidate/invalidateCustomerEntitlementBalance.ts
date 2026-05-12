import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import { AGGREGATED_BALANCE_FIELD } from "../../config/fullSubjectCacheConfig.js";

export const invalidateCustomerEntitlementBalance = async ({
	orgId,
	env,
	customerId,
	featureId,
	customerEntitlementId,
	redisV2,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	customerEntitlementId: string;
	redisV2: Redis;
}): Promise<void> => {
	if (
		!orgId ||
		!env ||
		!customerId ||
		!featureId ||
		!customerEntitlementId ||
		redisV2.status !== "ready"
	) {
		return;
	}

	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId,
		env,
		customerId,
		featureId,
	});

	logger.warn(
		`[invalidateCustomerEntitlementBalance] HDEL customer=${customerId} feature=${featureId} cusEnt=${customerEntitlementId}`,
	);

	await tryRedisWrite(
		() =>
			redisV2.hdel(balanceKey, customerEntitlementId, AGGREGATED_BALANCE_FIELD),
		redisV2,
	);
};
