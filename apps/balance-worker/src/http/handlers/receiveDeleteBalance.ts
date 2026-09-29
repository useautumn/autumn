import type { DeleteBalanceCommand } from "@autumn/balance-engine";
import type { DeleteBalanceReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveDeleteBalance(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	// Our server builds and validates this command; re-parsing it here is pure cost.
	const command = context.get("request").command as DeleteBalanceCommand;
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runDeleteBalance(processor: PartitionProcessor) {
		return processor.deleteBalance({ command });
	}
	const response = await runtime.process(runDeleteBalance);
	requestLog.response = response;
	return context.json(response satisfies DeleteBalanceReply);
}
