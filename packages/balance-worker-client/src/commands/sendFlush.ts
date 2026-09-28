import type { FlushReply } from "../contracts/flush.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { FlushParams } from "../types/balanceWorkerClient.js";

export async function sendFlush({
	ctx,
	command,
	signal,
}: FlushParams & { ctx: RoutingContext }): Promise<FlushReply> {
	return sendToOwner<FlushReply>({
		ctx,
		path: "/v1/flush",
		command,
		signal,
	});
}
