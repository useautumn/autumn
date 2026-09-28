import { type FinalizeLockParamsV0, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runFinalizeLockInner } from "./runFinalizeLock.js";

/** Queued finalize replay. Never re-queues — the same dedup id would drop
 *  inside the FIFO window; transient errors rethrow so SQS redelivery retries. */
export const runQueuedFinalizeLock = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
}) => {
	try {
		return await runFinalizeLockInner({ ctx, params });
	} catch (error) {
		if (
			error instanceof RecaseError &&
			error.message.includes("Lock not found")
		) {
			ctx.logger.info("[finalizeLock] queued replay already resolved", {
				type: "finalize_lock_queue_replay_resolved",
				lock_id: params.lock_id,
			});
			return { success: true };
		}
		throw error;
	}
};
