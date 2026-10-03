import pLimit from "p-limit";
import {
	getCtxWithCustomerRedis,
	getRedisTargetsForCustomer,
} from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invalidateSharedBalanceFields } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateSharedBalanceFields.js";

const FLUSH_CONCURRENCY = 25;

/**
 * Lands each customer's cached balances in Postgres and drops them from Redis.
 * A batch invalidation unlinks balance hashes blindly, so a deduction accepted
 * in Redis but not yet synced would otherwise be lost and the next read would
 * rebuild the pre-deduction balance from Postgres. Best effort per customer:
 * one failure is logged and never stops the rest.
 */
export const flushCachedCustomerBalances = async ({
	ctx,
	customerIds,
	source,
}: {
	ctx: AutumnContext;
	customerIds: string[];
	source: string;
}): Promise<void> => {
	const limit = pLimit(FLUSH_CONCURRENCY);

	await Promise.all(
		customerIds.map((customerId) =>
			limit(async () => {
				const { ctx: customerCtx } = getCtxWithCustomerRedis({
					ctx,
					customerId,
				});
				const redisTargets = getRedisTargetsForCustomer({
					org: customerCtx.org,
					currentRedis: customerCtx.redisV2,
				});

				for (const redisV2 of redisTargets) {
					try {
						await invalidateSharedBalanceFields({
							ctx: customerCtx,
							customerId,
							redisV2,
							flushBalances: true,
						});
					} catch (error) {
						ctx.logger.error(
							`[flushCachedCustomerBalances] ${customerId}: flush before invalidation failed, source: ${source}, error: ${error}`,
						);
					}
				}
			}),
		),
	);
};
