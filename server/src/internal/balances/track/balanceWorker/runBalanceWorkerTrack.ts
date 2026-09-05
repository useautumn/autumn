import type { TrackParams, TrackResponseV3 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { trackParamsToTrackCommand } from "./balanceWorkerTrackRequest.js";
import { trackDecisionToTrackResponse } from "./balanceWorkerTrackResponse.js";

export async function runBalanceWorkerTrack({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}): Promise<TrackResponseV3> {
	const command = trackParamsToTrackCommand({ ctx, body });
	const decision = await getBalanceWorkerClient().track({ command });
	return trackDecisionToTrackResponse({ ctx, decision });
}
