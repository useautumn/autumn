import type { FinalizeReply } from "../contracts/finalize.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { FinalizeParams } from "../types/balanceWorkerClient.js";

export async function sendFinalize({
	ctx,
	command,
	signal,
}: FinalizeParams & { ctx: RoutingContext }): Promise<FinalizeReply> {
	return sendToOwner<FinalizeReply>({
		ctx,
		path: "/v1/finalize",
		command,
		signal,
	});
}
