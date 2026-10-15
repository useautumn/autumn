import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TokenDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { queueTrack } from "../../utils/queueTrack.js";

type TrackSpoolReason = "append_failed" | "append_slow";

/**
 * Writes the track to the async track queue. `runQueuedTrack` replays it under the original request id and
 * timestamp, so the worker sees the same command ids the append carried. True once SQS holds it.
 */
export async function spoolTrack({
	ctx,
	body,
	tokens,
	reason,
	appendError,
	startedAt,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	tokens?: TokenDeduction;
	reason: TrackSpoolReason;
	appendError?: unknown;
	/** `performance.now()` when the append started. */
	startedAt: number;
}): Promise<boolean> {
	const queued = await queueTrack({
		ctx,
		body: { ...body, timestamp: body.timestamp ?? ctx.timestamp },
		tokens,
		options: { spooledAt: Date.now(), logFallback: false },
	});
	if (!queued) return false;
	ctx.logger.warn(`[balanceWorker] track spooled to SQS: ${reason}`, {
		type: "balance_worker_track_spooled",
		spool_reason: reason,
		spool_elapsed_ms: Math.round(performance.now() - startedAt),
		feature_id: body.feature_id,
		event_name: body.event_name,
		...(appendError !== undefined && {
			append_error:
				appendError instanceof Error
					? appendError.message
					: String(appendError),
			append_error_name:
				appendError instanceof Error ? appendError.name : undefined,
		}),
	});
	return true;
}
