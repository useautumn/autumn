import type { TrackParams, TrackResponseV3 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withBalanceWorkerFailOpen } from "../../balanceWorker/failOpen/withBalanceWorkerFailOpen.js";
import { runBalanceWorkerTrack } from "./runBalanceWorkerTrack.js";

/** A track route on the worker: queued when async, else applied, and queued instead when the org is over its
 *  rate cap or the owner is unreachable. */
export async function trackOnBalanceWorker({
	ctx,
	body,
	isAsync,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	isAsync: boolean;
}): Promise<{ result: TrackResponseV3; status: 200 | 202 }> {
	if (isAsync)
		return {
			result: await runBalanceWorkerTrack({ ctx, body, isAsync: true }),
			status: 202,
		};
	const { result, failedOpen } = await withBalanceWorkerFailOpen({
		ctx,
		source: "track",
		run: () => runBalanceWorkerTrack({ ctx, body }),
		// Queued on the command log, applied once the worker is back; each feature keeps its command id, so none applies twice.
		fallback: () => runBalanceWorkerTrack({ ctx, body, isAsync: true }),
	});
	return { result, status: failedOpen ? 202 : 200 };
}
