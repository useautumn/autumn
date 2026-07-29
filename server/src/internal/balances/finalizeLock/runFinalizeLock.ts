import type { FinalizeLockParamsV0 } from "@autumn/shared";
import { withRedisFailOpen } from "@/external/redis/utils/withRedisFailOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { releaseLockClaimMarker } from "@/internal/balances/utils/lockV2/releaseLockClaimMarker.js";
import { queueFinalizeLock } from "./queueFinalizeLock.js";
import { runFinalizeLockV2 } from "./runFinalizeLockV2.js";

type RunFinalizeLockArgs = {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
};

export const runFinalizeLock = async (args: RunFinalizeLockArgs) => {
	return withRedisFailOpen({
		source: "runFinalizeLock",
		run: () => runFinalizeLockInner(args),
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
};

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
