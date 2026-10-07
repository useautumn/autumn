import { parseReadSubjectStateCommand } from "@autumn/balance-engine";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";
import { readInboundCommand } from "./readInboundCommand.js";

export async function receiveReadSubjectState(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	const command = readInboundCommand({
		context,
		parse: parseReadSubjectStateCommand,
	});
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runReadSubjectState(processor: PartitionProcessor) {
		return processor.readSubjectState({ command });
	}
	const response = await runtime.process(runReadSubjectState);
	requestLog.response = response;
	return context.json(response satisfies ReadSubjectStateReply);
}
