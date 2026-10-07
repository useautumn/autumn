import { parseResetCommand } from "@autumn/balance-engine";
import type { ResetReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";
import { readInboundCommand } from "./readInboundCommand.js";

export async function receiveReset(context: Context<BalanceWorkerHttpEnv>) {
	const { runtime } = context.get("ctx");
	const command = readInboundCommand({ context, parse: parseResetCommand });
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runReset(processor: PartitionProcessor) {
		return processor.reset({ command });
	}
	const response = await runtime.process(runReset);
	requestLog.response = response;
	return context.json(response satisfies ResetReply);
}
