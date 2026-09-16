import type { TrackDecision } from "@autumn/balance-engine";
import type { BalanceWorkerTrackResponse } from "../contracts/track.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { TrackParams } from "../types/balanceWorkerClient.js";

export async function sendTrack({
	ctx,
	command,
	signal,
}: TrackParams & { ctx: RoutingContext }): Promise<TrackDecision> {
	const { decision } = await sendToOwner<BalanceWorkerTrackResponse>({
		ctx,
		path: "/v1/track",
		command,
		signal,
	});
	return decision;
}
