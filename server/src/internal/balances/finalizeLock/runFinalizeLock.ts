import { type FinalizeLockParamsV1, RecaseError } from "@autumn/shared";
import { withRedisFailOpen } from "@/external/redis/utils/withRedisFailOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { releaseLockClaimMarker } from "@/internal/balances/utils/lockV2/releaseLockClaimMarker.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { getBalanceLock } from "./balanceWorker/getBalanceLock.js";
import { runBalanceWorkerFinalize } from "./balanceWorker/runBalanceWorkerFinalize.js";
import { waitForHandedInLock } from "./balanceWorker/waitForHandedInLock.js";
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

/** What every lookup answers for a lock_id it doesn't know: no worker row, and no Redis receipt. */
export const isLockNotFoundError = (error: unknown): boolean =>
	error instanceof RecaseError && error.message.includes("Lock not found");

/** A worker customer's lock an Atom answered may not be handed in yet: its row, once it lands, or null. */
const handedInLockOf = async ({ ctx, params }: RunFinalizeLockArgs) => {
	const customerId = params.customer_id;
	if (!customerId || !isBalanceWorkerRolloutEnabled({ ctx, customerId }))
		return null;
	return waitForHandedInLock({ ctx, lockId: params.lock_id, customerId });
};

/** A lock lives where it was taken and names its customer; the request names the lock, and from 2.6 its customer. */
export const finalizeWhereTheLockLives = async ({
	ctx,
	params,
	waitForHandIn = false,
}: RunFinalizeLockArgs & { waitForHandIn?: boolean }) => {
	const workerLock = await getBalanceLock({
		ctx,
		lockId: params.lock_id,
		customerId: isLegacyFinalizeWithoutCustomer({ params })
			? undefined
			: params.customer_id,
	});
	if (workerLock)
		return runBalanceWorkerFinalize({ ctx, params, lock: workerLock });
	try {
		return await runFinalizeLockInner({ ctx, params });
	} catch (error) {
		if (!waitForHandIn || !isLockNotFoundError(error)) throw error;
		const handedIn = await handedInLockOf({ ctx, params });
		if (!handedIn) throw error;
		return runBalanceWorkerFinalize({ ctx, params, lock: handedIn });
	}
};

export const runFinalizeLock = async (args: RunFinalizeLockArgs) =>
	withRedisFailOpen({
		source: "runFinalizeLock",
		run: () => finalizeWhereTheLockLives({ ...args, waitForHandIn: true }),
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
