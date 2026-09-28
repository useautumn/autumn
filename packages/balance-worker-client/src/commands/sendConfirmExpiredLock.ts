import type { ConfirmExpiredLockReply } from "../contracts/confirmExpiredLock.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { ConfirmExpiredLockParams } from "../types/balanceWorkerClient.js";

export async function sendConfirmExpiredLock({
	ctx,
	command,
	signal,
}: ConfirmExpiredLockParams & {
	ctx: RoutingContext;
}): Promise<ConfirmExpiredLockReply> {
	return sendToOwner<ConfirmExpiredLockReply>({
		ctx,
		path: "/v1/confirm-expired-lock",
		command,
		signal,
	});
}
