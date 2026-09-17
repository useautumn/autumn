import type { TrackReply } from "../contracts/track.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { TrackParams } from "../types/balanceWorkerClient.js";

export async function sendTrack({
	ctx,
	command,
	signal,
}: TrackParams & { ctx: RoutingContext }): Promise<TrackReply> {
	return sendToOwner<TrackReply>({
		ctx,
		path: "/v1/track",
		command,
		signal,
	});
}
