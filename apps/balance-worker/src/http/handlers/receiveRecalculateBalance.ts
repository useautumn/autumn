import type { RecalculateBalanceCommand } from "@autumn/balance-engine";
import type { RecalculateBalanceReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveRecalculateBalance(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	// Our server builds and validates this command; re-parsing it here is pure cost.
	const command = context.get("request").command as RecalculateBalanceCommand;
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runRecalculateBalance(processor: PartitionProcessor) {
		return processor.recalculateBalance({ command });
	}
	const response = await runtime.process(runRecalculateBalance);
	requestLog.response = response;
	return context.json(response satisfies RecalculateBalanceReply);
}
