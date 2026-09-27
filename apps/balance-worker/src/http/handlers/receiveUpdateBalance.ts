import type { UpdateBalanceCommand } from "@autumn/balance-engine";
import type { UpdateBalanceReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveUpdateBalance(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	// Our server builds and validates this command; re-parsing it here is pure cost.
	const command = context.get("request").command as UpdateBalanceCommand;
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runUpdateBalance(processor: PartitionProcessor) {
		return processor.updateBalance({ command });
	}
	const response = await runtime.process(runUpdateBalance);
	requestLog.response = response;
	return context.json(response satisfies UpdateBalanceReply);
}
