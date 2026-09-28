import type { DeleteBalanceReply } from "../contracts/deleteBalance.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { DeleteBalanceParams } from "../types/balanceWorkerClient.js";

export async function sendDeleteBalance({
	ctx,
	command,
	signal,
}: DeleteBalanceParams & {
	ctx: RoutingContext;
}): Promise<DeleteBalanceReply> {
	return sendToOwner<DeleteBalanceReply>({
		ctx,
		path: "/v1/delete-balance",
		command,
		signal,
	});
}
