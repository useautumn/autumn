import type { InitializeReply } from "../contracts/initialize.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { InitializeParams } from "../types/balanceWorkerClient.js";

export async function sendInitialize({
	ctx,
	request,
	signal,
}: InitializeParams & {
	ctx: RoutingContext;
}): Promise<InitializeReply> {
	return sendToOwner<InitializeReply>({
		ctx,
		path: "/v1/initialize",
		command: request.command,
		payload: { state: request.state, catalogRows: request.catalogRows },
		signal,
	});
}
