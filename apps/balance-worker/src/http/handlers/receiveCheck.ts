import type { CheckCommand } from "@autumn/balance-engine";
import { CHECK_LEASE_REQUEST_HEADER } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import { serializeCheckReply } from "../replies/serializeSubjectReply.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveCheck(context: Context<BalanceWorkerHttpEnv>) {
	const { runtime } = context.get("ctx");
	// Our server builds and validates this command; re-parsing it here is pure cost.
	const command = context.get("request").command as CheckCommand;
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	const requestsLease = context.req.header(CHECK_LEASE_REQUEST_HEADER) === "1";
	function runCheck(processor: PartitionProcessor) {
		return processor.check({ command, requestsLease });
	}
	const response = await runtime.process(runCheck);
	requestLog.response = response;
	return context.body(serializeCheckReply({ reply: response }), 200, {
		"content-type": "application/json",
	});
}
