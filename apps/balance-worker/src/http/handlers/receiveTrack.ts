import { parseTrackCommand } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveTrack(context: Context<BalanceWorkerHttpEnv>) {
	const ctx = context.get("ctx");
	const { command } = context.get("request");
	const parsedCommand = parseTrackCommand({ input: command });
	const requestLog = context.get("requestLog");
	requestLog.command = parsedCommand;

	function runTrack(processor: PartitionProcessor) {
		return processor.track({ command: parsedCommand });
	}

	const response = await ctx.runtime.process(runTrack);
	requestLog.response = response;
	return context.json(response satisfies TrackReply);
}
