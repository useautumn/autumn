import type { CheckCommand } from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import { serializeSubjectReply } from "../replies/serializeSubjectReply.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

/** A memoised reply is one object per (subject view, selection, second), so its body is serialised once. */
const serializedReplies = new WeakMap<CheckReply, string>();

function serializedReplyOf({ reply }: { reply: CheckReply }): string {
	const known = serializedReplies.get(reply);
	if (known !== undefined) return known;
	const body = serializeSubjectReply({ reply });
	serializedReplies.set(reply, body);
	return body;
}

export async function receiveCheck(context: Context<BalanceWorkerHttpEnv>) {
	const { runtime } = context.get("ctx");
	// Our server builds and validates this command; re-parsing it here is pure cost.
	const command = context.get("request").command as CheckCommand;
	const requestLog = context.get("requestLog");
	requestLog.command = command;
	function runCheck(processor: PartitionProcessor) {
		return processor.check({ command });
	}
	const response = await runtime.process(runCheck);
	requestLog.response = response;
	return context.body(serializedReplyOf({ reply: response }), 200, {
		"content-type": "application/json",
	});
}
