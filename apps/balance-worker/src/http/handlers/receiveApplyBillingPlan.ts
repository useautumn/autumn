import { parseApplyBillingPlanRequest } from "@autumn/balance-engine";
import type { ApplyBillingPlanReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";
import { readInboundRequest } from "./readInboundCommand.js";

export async function receiveApplyBillingPlan(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	const request = readInboundRequest({
		context,
		parse: parseApplyBillingPlanRequest,
	});
	const requestLog = context.get("requestLog");
	requestLog.command = {
		requestId: request.command.requestId,
		identity: request.command.identity,
		commandId: request.command.commandId,
	};
	function runApplyBillingPlan(processor: PartitionProcessor) {
		return processor.applyBillingPlan({ request });
	}
	const response = await runtime.process(runApplyBillingPlan);
	requestLog.response = response;
	return context.json(response satisfies ApplyBillingPlanReply);
}
