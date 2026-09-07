import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { TrackParams, TrackResponseV3 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	BalanceWorkerUnsupportedError,
	rethrowBalanceWorkerError,
} from "../../balanceWorker/balanceWorkerErrors.js";
import { validateBalanceWorkerRequest } from "../../balanceWorker/validateBalanceWorkerRequest.js";
import { trackParamsToTrackCommand } from "./balanceWorkerTrackRequest.js";
import { trackDecisionToTrackResponse } from "./balanceWorkerTrackResponse.js";

export async function runBalanceWorkerTrack({
	ctx,
	body,
	client,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	client?: Pick<BalanceWorkerClient, "track">;
}): Promise<TrackResponseV3> {
	validateBalanceWorkerRequest({ ctx, body });
	if (!body.feature_id || body.event_name)
		throw new BalanceWorkerUnsupportedError({
			reason: "event_name_not_supported",
		});
	const command = trackParamsToTrackCommand({ ctx, body });
	try {
		const decision = await (client ?? getBalanceWorkerClient()).track({
			command,
		});
		return trackDecisionToTrackResponse({ ctx, decision });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
