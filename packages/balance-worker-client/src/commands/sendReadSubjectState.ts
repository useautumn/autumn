import type { ReadSubjectStateReply } from "../contracts/readSubjectState.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { ReadSubjectStateParams } from "../types/balanceWorkerClient.js";

export async function sendReadSubjectState({
	ctx,
	command,
	signal,
}: ReadSubjectStateParams & {
	ctx: RoutingContext;
}): Promise<ReadSubjectStateReply> {
	return sendToOwner<ReadSubjectStateReply>({
		ctx,
		path: "/v1/read-subject-state",
		command,
		signal,
	});
}
