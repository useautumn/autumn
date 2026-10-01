import type { BalanceAllocations, UsageWindow } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
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
}: {
	ctx: AutumnContext;
	customerId: string;
	allocations: BalanceAllocations;
	counterPatches: AllocationCounterPatch[];
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
			await tryRedisWrite(
				() =>
					ctx.redisV2.patchAllocationCounter(
						balanceKey,
						JSON.stringify({ now, counter, usage_delta: usageDelta }),
					),
				ctx.redisV2,
			);
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
