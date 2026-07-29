import type { FinalizeLockParamsV0 } from "@autumn/shared";
import { withRedisFailOpen } from "@/external/redis/utils/withRedisFailOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { fetchLockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import { runFinalizeLockV2 } from "./runFinalizeLockV2.js";

type RunFinalizeLockArgs = {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
};

export const runFinalizeLock = async (args: RunFinalizeLockArgs) => {
	if (isFullSubjectRolloutEnabled({ ctx: args.ctx })) {
	}

	return withRedisFailOpen({
		source: "runFinalizeLock",
		run: () => runFinalizeLockInner(args),
		fallback: () => {
			addToExtraLogs({
				ctx: args.ctx,
				extras: { finalizeLockFailedOpen: true },
			});
			return { success: true };
		},
	});
};

const runFinalizeLockInner = async ({ ctx, params }: RunFinalizeLockArgs) => {
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
