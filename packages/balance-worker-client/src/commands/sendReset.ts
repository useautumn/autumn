import type { ResetReply } from "../contracts/reset.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { ResetParams } from "../types/balanceWorkerClient.js";

export async function sendReset({
	ctx,
	command,
	signal,
}: ResetParams & {
	ctx: RoutingContext;
}): Promise<ResetReply> {
	return sendToOwner<ResetReply>({
		ctx,
		path: "/v1/reset",
		command,
		signal,
	});
}
