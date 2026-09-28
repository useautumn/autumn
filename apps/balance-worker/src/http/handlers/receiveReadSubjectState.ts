import { parseReadSubjectStateCommand } from "@autumn/balance-engine";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveReadSubjectState(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	const command = parseReadSubjectStateCommand({
		input: context.get("request").command,
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
