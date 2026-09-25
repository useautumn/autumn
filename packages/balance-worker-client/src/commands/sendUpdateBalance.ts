import type { UpdateBalanceReply } from "../contracts/updateBalance.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { UpdateBalanceParams } from "../types/balanceWorkerClient.js";

export async function sendUpdateBalance({
	ctx,
	command,
	signal,
}: UpdateBalanceParams & {
	ctx: RoutingContext;
}): Promise<UpdateBalanceReply> {
	return sendToOwner<UpdateBalanceReply>({
		ctx,
		path: "/v1/update-balance",
		command,
		signal,
	});
}
