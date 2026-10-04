import type { CheckReply } from "../contracts/check.js";
import { CHECK_LEASE_REQUEST_HEADER } from "../contracts/worker.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { CheckParams } from "../types/balanceWorkerClient.js";

export async function sendCheck({
	ctx,
	command,
	signal,
	requestLease = false,
}: CheckParams & {
	ctx: RoutingContext;
	requestLease?: boolean;
}): Promise<CheckReply> {
	return sendToOwner<CheckReply>({
		ctx,
		path: "/v1/check",
		command,
		signal,
		...(requestLease && { headers: { [CHECK_LEASE_REQUEST_HEADER]: "1" } }),
	});
}
