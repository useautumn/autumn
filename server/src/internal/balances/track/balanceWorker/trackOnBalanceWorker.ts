import type { TrackParams, TrackResponseV3 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withBalanceWorkerFailOpen } from "../../balanceWorker/failOpen/withBalanceWorkerFailOpen.js";
import { runBalanceWorkerTrack } from "./runBalanceWorkerTrack.js";

/** A track route on the worker: queued when async, else applied, and queued instead when the org is over its
 *  rate cap, the owner is unreachable or overloaded, or the owner took the command and never confirmed it. */
export async function trackOnBalanceWorker({
	ctx,
	body,
	isAsync,
	recordsCreditCost,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	isAsync: boolean;
	/** A track_tokens request, whose event records `credit_cost`. */
	recordsCreditCost?: boolean;
}): Promise<{ result: TrackResponseV3; status: 200 | 202 }> {
	if (isAsync)
		return {
			result: await runBalanceWorkerTrack({
				ctx,
				body,
				isAsync: true,
				recordsCreditCost,
			}),
			status: 202,
		};
	const { result, failedOpen } = await withBalanceWorkerFailOpen({
		ctx,
		source: "track",
		run: () => runBalanceWorkerTrack({ ctx, body, recordsCreditCost }),
		// Queued on the command log, applied once the worker has room; each feature keeps its command id, so a
		// command the worker did take before going quiet is a no-op on replay, never a second deduction.
		fallback: () =>
			runBalanceWorkerTrack({ ctx, body, isAsync: true, recordsCreditCost }),
	});
	return { result, status: failedOpen ? 202 : 200 };
}
