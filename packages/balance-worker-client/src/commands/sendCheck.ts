import type { CheckDecision } from "@autumn/balance-engine";
import type { BalanceWorkerCheckResponse } from "../contracts/check.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { CheckParams } from "../types/balanceWorkerClient.js";

export async function sendCheck({
	ctx,
	command,
	signal,
}: CheckParams & { ctx: RoutingContext }): Promise<CheckDecision> {
	const { decision } = await sendToOwner<BalanceWorkerCheckResponse>({
		ctx,
		path: "/v1/check",
		command,
		signal,
	});
	return decision;
}
