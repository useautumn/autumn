import type { BalanceAllocations, UsageWindow } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js";
import { updateCachedCustomerData } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerData.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/** A counter as setAllocationCounters wrote it, and the delta it applied to a live row. */
export type AllocationCounterPatch = {
	counter: UsageWindow;
	usageDelta: number;
};

/** Mirrors a committed re-fit into the caches without dropping any cached balance, so un-synced deductions survive. */
export const patchCachedAllocations = async ({
	ctx,
	customerId,
	allocations,
	counterPatches,
	flushBalances,
}: {
	ctx: AutumnContext;
	customerId: string;
	allocations: BalanceAllocations;
	counterPatches: AllocationCounterPatch[];
	/** Whether the refit started with a flush; only then are cached balances still safe to flush. */
	flushBalances: boolean;
}): Promise<void> => {
	try {
		await evictBalanceWorkerCustomer({ ctx, customerId });
		const now = Date.now();
		for (const { counter, usageDelta } of counterPatches) {
			const balanceKey = buildSharedFullSubjectBalanceKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				featureId: counter.feature_id,
			});
			const patched = await tryRedisWrite(
				() =>
					ctx.redisV2.patchAllocationCounter(
						balanceKey,
						JSON.stringify({ now, counter, usage_delta: usageDelta }),
					),
				ctx.redisV2,
			).catch((error) => {
				ctx.logger.error("[patchCachedAllocations] counter patch failed", {
					error,
				});
				return null;
			});
			// New shares over a stale counter would misgate draws; a cold cache reloads both from Postgres.
			if (patched === null) {
				await invalidateCachedFullSubject({
					ctx,
					customerId,
					source: "patchCachedAllocations",
					flushBalances,
				});
				return;
			}
		}
		await updateCachedCustomerData({
			ctx,
			customerId,
			updates: { balance_allocations: allocations },
		});
	} catch (error) {
		ctx.logger.error("[patchCachedAllocations] failed", { error });
	}
};
