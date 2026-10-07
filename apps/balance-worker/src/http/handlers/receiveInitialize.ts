import { parseInitializeRequest } from "@autumn/balance-engine";
import type { InitializeReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import { z } from "zod/v4";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

const initializePayloadSchema = z
	.object({ state: z.unknown(), catalogRows: z.unknown() })
	.strict();

export async function receiveInitialize(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	const { command, payload } = context.get("request");
	const request = parseInitializeRequest({
		input: { command, ...initializePayloadSchema.parse(payload) },
	});
	const requestLog = context.get("requestLog");
	requestLog.command = {
		requestId: request.command.requestId,
		identity: request.command.identity,
		commandId: request.command.commandId,
	};
	function runInitialize(processor: PartitionProcessor) {
		return processor.initialize({ request });
	}
	const response = await runtime.process(runInitialize);
	requestLog.response = response;
	return context.json(response satisfies InitializeReply);
}
