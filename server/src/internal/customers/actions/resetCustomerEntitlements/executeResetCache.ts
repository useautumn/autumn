import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ResetCusEntParam } from "@/internal/balances/utils/sql/client.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * Atomically resets cusEnt fields in the cached FullCustomer blob.
 * Skips gracefully if the cache doesn't exist or the cusEnt was already reset.
 * Fire-and-forget — failures are logged but don't propagate.
 */
export const executeResetCache = async ({
	ctx,
	customerId,
	resets,
}: {
	ctx: AutumnContext;
	customerId: string;
	resets: ResetCusEntParam[];
}): Promise<void> => {
	if (resets.length === 0) return;

	const { org, env, logger } = ctx;

	const cacheKey = buildFullCustomerCacheKey({
		orgId: org.id,
		env,
		customerId,
	});

	await tryRedisWrite(() =>
		redis.resetCustomerEntitlements(cacheKey, JSON.stringify({ resets })),
	);
};
