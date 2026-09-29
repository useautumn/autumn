import { parseFlushCommand } from "@autumn/balance-engine";
import type { FlushReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveFlush(context: Context<BalanceWorkerHttpEnv>) {
	const { runtime } = context.get("ctx");
	const command = parseFlushCommand({ input: context.get("request").command });
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runFlush(processor: PartitionProcessor) {
		return processor.flush({ command });
	}
	const response = await runtime.process(runFlush);
	return context.json(response satisfies FlushReply);
}
