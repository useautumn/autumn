import type { EvictCommand } from "@autumn/balance-engine";
import type { EvictReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveEvict(context: Context<BalanceWorkerHttpEnv>) {
	const { runtime } = context.get("ctx");
	// Cast, not parsed: our server validated it, and a field from a newer server must not fail it.
	const command = context.get("request").command as EvictCommand;
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runEvict(processor: PartitionProcessor) {
		return processor.evict({ command });
	}
	const response = await runtime.process(runEvict);
	return context.json(response satisfies EvictReply);
}
