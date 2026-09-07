import { parseCheckCommand } from "@autumn/balance-engine";
import type { BalanceWorkerCheckResponse } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveCheck(context: Context<BalanceWorkerHttpEnv>) {
	const { runtime } = context.get("ctx");
	const command = parseCheckCommand({ input: context.get("request").command });
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runCheck(processor: PartitionProcessor) {
		return processor.check({ command });
	}
	const decision = await runtime.process(runCheck);
	requestLog.decision = decision;
	return context.json({ decision } satisfies BalanceWorkerCheckResponse);
}
