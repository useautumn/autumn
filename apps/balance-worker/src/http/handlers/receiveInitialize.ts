import { parseInitializeCommand } from "@autumn/balance-engine";
import type { BalanceWorkerInitializeResponse } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveInitialize(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	const command = parseInitializeCommand({
		input: context.get("request").command,
	});
	const requestLog = context.get("requestLog");
	requestLog.command = {
		requestId: command.requestId,
		identity: command.identity,
		commandId: command.initializationId,
	};
	function runInitialize(processor: PartitionProcessor) {
		return processor.initialize({ command });
	}
	const decision = await runtime.process(runInitialize);
	requestLog.decision = decision;
	return context.json({ decision } satisfies BalanceWorkerInitializeResponse);
}
