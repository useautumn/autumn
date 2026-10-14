import type { TrackParams, TrackResponseV3 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withBalanceWorkerFailOpen } from "../../balanceWorker/failOpen/withBalanceWorkerFailOpen.js";
import { runBalanceWorkerTrack } from "./runBalanceWorkerTrack.js";

export async function trackOnBalanceWorker({
	ctx,
	body,
	isAsync,
	recordsCreditCost,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	isAsync: boolean;
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
		fallback: () =>
			runBalanceWorkerTrack({ ctx, body, isAsync: true, recordsCreditCost }),
	});
	return { result, status: failedOpen ? 202 : 200 };
}
