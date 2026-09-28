import type { EvictReply } from "../contracts/evict.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { EvictParams } from "../types/balanceWorkerClient.js";

export async function sendEvict({
	ctx,
	command,
	signal,
}: EvictParams & { ctx: RoutingContext }): Promise<EvictReply> {
	return sendToOwner<EvictReply>({
		ctx,
		path: "/v1/evict",
		command,
		signal,
	});
}
