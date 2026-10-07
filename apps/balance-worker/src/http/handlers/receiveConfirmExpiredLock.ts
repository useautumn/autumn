import { parseConfirmExpiredLockCommand } from "@autumn/balance-engine";
import type { ConfirmExpiredLockReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";
import { readInboundCommand } from "./readInboundCommand.js";

export async function receiveConfirmExpiredLock(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	const command = readInboundCommand({
		context,
		parse: parseConfirmExpiredLockCommand,
	});
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runConfirmExpiredLock(processor: PartitionProcessor) {
		return processor.confirmExpiredLock({ command });
	}
	const response = await runtime.process(runConfirmExpiredLock);
	requestLog.response = response;
	return context.json(response satisfies ConfirmExpiredLockReply);
}
