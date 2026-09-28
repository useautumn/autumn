import type { CheckReply } from "../contracts/check.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { CheckParams } from "../types/balanceWorkerClient.js";

export async function sendCheck({
	ctx,
	command,
	signal,
}: CheckParams & { ctx: RoutingContext }): Promise<CheckReply> {
	return sendToOwner<CheckReply>({
		ctx,
		path: "/v1/check",
		command,
		signal,
	});
}
