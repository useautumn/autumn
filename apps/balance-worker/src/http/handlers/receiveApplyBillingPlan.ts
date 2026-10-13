import { parseApplyBillingPlanRequest } from "@autumn/balance-engine";
import type { ApplyBillingPlanReply } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import { z } from "zod/v4";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

const applyBillingPlanPayloadSchema = z
	.object({ catalogRows: z.unknown() })
	.loose();

export async function receiveApplyBillingPlan(
	context: Context<BalanceWorkerHttpEnv>,
) {
	const { runtime } = context.get("ctx");
	const { command, payload } = context.get("request");
	// The routed command stays authoritative: only the payload's own fields are read.
	const { catalogRows } = applyBillingPlanPayloadSchema.parse(payload);
	const request = parseApplyBillingPlanRequest({
		input: { command, catalogRows },
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
