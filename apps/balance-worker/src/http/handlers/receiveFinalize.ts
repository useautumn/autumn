import { parseFinalizeCommand } from "@autumn/balance-engine";
import type { FinalizeReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveFinalize(context: Context<BalanceWorkerHttpEnv>) {
	const { runtime } = context.get("ctx");
	const command = parseFinalizeCommand({
		input: context.get("request").command,
	});
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runFinalize(processor: PartitionProcessor) {
		return processor.finalize({ command });
	}
	const response = await runtime.process(runFinalize);
	requestLog.response = response;
	return context.json(response satisfies FinalizeReply);
}
