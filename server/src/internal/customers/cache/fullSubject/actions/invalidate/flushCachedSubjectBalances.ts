import { getRedisTargetsForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { invalidateSharedBalanceFields } from "./invalidateSharedBalanceFields.js";

/**
 * The legacy lane's counterpart to flushBalanceWorkerCustomer: deductions still waiting on the batched sync are
 * written to Postgres and their cached fields dropped, so the next read rebuilds them from Postgres. Call it
 * before a handler reads Postgres to rewrite it: the invalidation after that write then has nothing pending to
 * lose. A no-op for a customer on the balance worker, whose own flush lands its writes. Best effort: a failure
 * is logged and the handler goes ahead, as it would have before.
 */
export const flushCachedSubjectBalances = async ({
	ctx,
	customerId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	source: string;
}): Promise<void> => {
	if (!customerId || isBalanceWorkerRolloutEnabled({ ctx, customerId })) return;
	try {
		await Promise.all(
			getRedisTargetsForCustomer({
				org: ctx.org,
				currentRedis: ctx.redisV2,
			}).map((redisV2) =>
				invalidateSharedBalanceFields({
					ctx,
					customerId,
					redisV2,
					flushBalances: true,
				}),
			),
		);
	} catch (error) {
		ctx.logger.error(
			"[flushCachedSubjectBalances] flush failed; pending deductions may be lost on invalidation",
			{ error, data: { customerId, source } },
		);
	}
};
