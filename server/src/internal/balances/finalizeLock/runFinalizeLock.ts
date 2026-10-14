import type { FinalizeLockParamsV1 } from "@autumn/shared";
import { withRedisFailOpen } from "@/external/redis/utils/withRedisFailOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { releaseLockClaimMarker } from "@/internal/balances/utils/lockV2/releaseLockClaimMarker.js";
import { getBalanceLock } from "./balanceWorker/getBalanceLock.js";
import { runBalanceWorkerFinalize } from "./balanceWorker/runBalanceWorkerFinalize.js";
import { queueFinalizeLock } from "./queueFinalizeLock.js";
import { runFinalizeLockV2 } from "./runFinalizeLockV2.js";

type RunFinalizeLockArgs = {
	ctx: AutumnContext;
	params: FinalizeLockParamsV1;
};

/** Before 2.6 a finalize names no customer: its lock is found by lock_id alone, as it always was. */
const isLegacyFinalizeWithoutCustomer = ({
	params,
}: {
	params: FinalizeLockParamsV1;
}): boolean => !params.customer_id;

/** A lock lives where it was taken and names its customer; the request names the lock, and from 2.6 its customer. */
export const finalizeWhereTheLockLives = async ({
	ctx,
	params,
}: RunFinalizeLockArgs) => {
	const workerLock = await getBalanceLock({
		ctx,
		lockId: params.lock_id,
		customerId: isLegacyFinalizeWithoutCustomer({ params })
			? undefined
			: params.customer_id,
	});
	return workerLock
		? runBalanceWorkerFinalize({ ctx, params, lock: workerLock })
		: runFinalizeLockInner({ ctx, params });
};

export const runFinalizeLock = async (args: RunFinalizeLockArgs) =>
	withRedisFailOpen({
		source: "runFinalizeLock",
		run: () => finalizeWhereTheLockLives(args),
		fallback: async (error) => {
			// The dying attempt may have claimed the receipt; release so the
			// queued replay can reclaim.
			await releaseLockClaimMarker({
				ctx: args.ctx,
				lockId: args.params.lock_id,
			});
			const queuedResponse = await queueFinalizeLock({
				ctx: args.ctx,
				params: args.params,
			});
			if (queuedResponse) return queuedResponse;
			throw error;
		},
	});

// The Redis path is being deprecated soon and keeps operating as today, finding the customer from the lock_id.
export const runFinalizeLockInner = async ({
	ctx,
	params,
}: RunFinalizeLockArgs) => {
	const fetchedReceipt = await fetchLockReceipt({
		ctx,
		lockId: params.lock_id,
	});

	return runFinalizeLockV2({
		ctx,
		params,
		receipt: fetchedReceipt.receipt,
		lockReceiptKey: fetchedReceipt.lockReceiptKey,
		claimed: fetchedReceipt.claimed,
		lockRedisInstance: fetchedReceipt.redisInstance,
	});
};
