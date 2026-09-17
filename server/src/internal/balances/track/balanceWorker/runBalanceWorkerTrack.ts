import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { TrackParams, TrackResponseV3 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	BalanceWorkerUnsupportedError,
	rethrowBalanceWorkerError,
} from "../../balanceWorker/balanceWorkerErrors.js";
import { loadBalanceWorkerSubject } from "../../balanceWorker/loadBalanceWorkerSubject.js";
import { validateBalanceWorkerRequest } from "../../balanceWorker/validateBalanceWorkerRequest.js";
import { trackReplyToApiResponse } from "./balanceWorkerTrackReply.js";
import { trackParamsToTrackCommand } from "./balanceWorkerTrackRequest.js";

export async function runBalanceWorkerTrack({
	ctx,
	body,
	client,
	loadSubject = loadBalanceWorkerSubject,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	client?: Pick<BalanceWorkerClient, "track">;
	loadSubject?: typeof loadBalanceWorkerSubject;
}): Promise<TrackResponseV3> {
	validateBalanceWorkerRequest({ ctx, body });
	if (!body.feature_id || body.event_name)
		throw new BalanceWorkerUnsupportedError({
			reason: "event_name_not_supported",
		});
	const command = trackParamsToTrackCommand({ ctx, body });
	try {
		const reply = await (client ?? getBalanceWorkerClient()).track({
			command,
		});
		const fullSubject = await loadSubject({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
		});
		return trackReplyToApiResponse({ ctx, command, reply, fullSubject });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
