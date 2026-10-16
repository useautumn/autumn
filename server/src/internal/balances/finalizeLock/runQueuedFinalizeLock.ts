import type { FinalizeLockParamsV1 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	finalizeWhereTheLockLives,
	isLockNotFoundError,
} from "./runFinalizeLock.js";

/** Queued finalize replay. Never re-queues — the same dedup id would drop
 *  inside the FIFO window; transient errors rethrow so SQS redelivery retries. */
export const runQueuedFinalizeLock = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV1;
}) => {
	try {
		return await finalizeWhereTheLockLives({ ctx, params });
	} catch (error) {
		if (isLockNotFoundError(error)) {
			ctx.logger.info("[finalizeLock] queued replay already resolved", {
				type: "finalize_lock_queue_replay_resolved",
				lock_id: params.lock_id,
			});
			return { success: true };
		}
		throw error;
	}
};
