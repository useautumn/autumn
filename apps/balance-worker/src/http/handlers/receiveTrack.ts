import type { TrackCommand } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveTrack(context: Context<BalanceWorkerHttpEnv>) {
	const ctx = context.get("ctx");
	const { command } = context.get("request");
	// Our server builds and validates this command; re-parsing it here is pure cost.
	const trackCommand = command as TrackCommand;
	const requestLog = context.get("requestLog");
	requestLog.command = trackCommand;

	function runTrack(processor: PartitionProcessor) {
		return processor.track({ command: trackCommand });
	}

	const response = await ctx.runtime.process(runTrack);
	requestLog.response = response;
	return context.json(response satisfies TrackReply);
}
