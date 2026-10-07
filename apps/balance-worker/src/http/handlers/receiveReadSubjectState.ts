import type { ReadSubjectStateCommand } from "@autumn/balance-engine";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveReadSubjectState(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	// Cast, not parsed: our server validated it, and a field from a newer server must not fail it.
	const command = context.get("request").command as ReadSubjectStateCommand;
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runReadSubjectState(processor: PartitionProcessor) {
		return processor.readSubjectState({ command });
	}
	const response = await runtime.process(runReadSubjectState);
	requestLog.response = response;
	return context.json(response satisfies ReadSubjectStateReply);
}
