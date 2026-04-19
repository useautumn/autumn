import { redisV2 } from "@/external/redis/initRedisV2.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildSharedFullSubjectBalanceKey } from "../../builders/buildSharedFullSubjectBalanceKey.js";
import { AGGREGATED_BALANCE_FIELD } from "../../config/fullSubjectCacheConfig.js";

export const invalidateCustomerEntitlementBalance = async ({
	orgId,
	env,
	customerId,
	featureId,
	customerEntitlementId,
}: {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	customerEntitlementId: string;
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

	await tryRedisWrite(
		() =>
			redisV2.hdel(
				balanceKey,
				customerEntitlementId,
				AGGREGATED_BALANCE_FIELD,
			),
		redisV2,
	);
};
