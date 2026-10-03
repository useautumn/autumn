import pLimit from "p-limit";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invalidateSharedBalanceFields } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateSharedBalanceFields.js";

const FLUSH_CONCURRENCY = 25;

/**
 * Lands each customer's cached balances in Postgres and drops them from Redis.
 * A batch invalidation unlinks balance hashes blindly, so a deduction accepted
 * in Redis but not yet synced would otherwise be lost and the next read would
 * rebuild the pre-deduction balance from Postgres.
 *
 * Only the customer's current Redis is flushed: a migration or legacy copy can
 * hold an older snapshot that would overwrite the newer balance. The batch
 * invalidation drops those copies. Best effort per customer: one failure is
 * logged and never stops the rest. Returns the customers whose flush threw, so
 * the caller can keep their cache rather than drop unsynced balances.
 */
export const flushCachedCustomerBalances = async ({
	ctx,
	customerIds,
	source,
}: {
	ctx: AutumnContext;
	customerIds: string[];
	source: string;
}): Promise<{ failedCustomerIds: Set<string> }> => {
	const limit = pLimit(FLUSH_CONCURRENCY);
	const failedCustomerIds = new Set<string>();

	await Promise.all(
		customerIds.map((customerId) =>
			limit(async () => {
				try {
					const { ctx: customerCtx } = getCtxWithCustomerRedis({
						ctx,
						customerId,
					});
					await invalidateSharedBalanceFields({
						ctx: customerCtx,
						customerId,
						redisV2: customerCtx.redisV2,
						flushBalances: true,
					});
				} catch (error) {
					failedCustomerIds.add(customerId);
					ctx.logger.error(
						`[flushCachedCustomerBalances] ${customerId}: flush before invalidation failed, source: ${source}, error: ${error}`,
					);
				}
			}),
		),
	);

	return { failedCustomerIds };
};
