import type { RecalculateBalanceReply } from "../contracts/recalculateBalance.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { RecalculateBalanceParams } from "../types/balanceWorkerClient.js";

export async function sendRecalculateBalance({
	ctx,
	command,
	signal,
}: RecalculateBalanceParams & {
	ctx: RoutingContext;
}): Promise<RecalculateBalanceReply> {
	return sendToOwner<RecalculateBalanceReply>({
		ctx,
		path: "/v1/recalculate-balance",
		command,
		signal,
	});
}
