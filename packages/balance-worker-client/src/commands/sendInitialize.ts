import type { InitializationDecision } from "@autumn/balance-engine";
import type { BalanceWorkerInitializeResponse } from "../contracts/initialize.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { InitializeParams } from "../types/balanceWorkerClient.js";

export async function sendInitialize({
	ctx,
	command,
	signal,
}: InitializeParams & {
	ctx: RoutingContext;
}): Promise<InitializationDecision> {
	const { decision } = await sendToOwner<BalanceWorkerInitializeResponse>({
		ctx,
		path: "/v1/initialize",
		command,
		signal,
	});
	return decision;
}
