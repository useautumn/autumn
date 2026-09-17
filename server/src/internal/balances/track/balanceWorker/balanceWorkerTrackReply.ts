import type { TrackCommand } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client";
import type { FullSubject } from "@autumn/shared";
import {
	AffectedResource,
	applyResponseVersionChanges,
	InsufficientBalanceError,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { workerStateToApiBalance } from "../../balanceWorker/workerStateToApiBalance.js";
import { trackReplyToDeductions } from "./trackReplyToDeductions.js";

/** The one place a worker track reply becomes the API's track response. */
export function trackReplyToApiResponse({
	ctx,
	command,
	reply,
	fullSubject,
}: {
	ctx: AutumnContext;
	command: TrackCommand;
	reply: TrackReply;
	fullSubject: FullSubject;
}): TrackResponseV3 {
	const { result, state } = reply;
	const balance = workerStateToApiBalance({
		ctx,
		fullSubject,
		state,
		featureId: command.featureId,
	});
	if (result.status === "rejected") {
		throw new InsufficientBalanceError({
			featureId: command.featureId,
			value: command.value,
			balance: balance.remaining,
		});
	}
	return applyResponseVersionChanges<TrackResponseV3>({
		ctx,
		input: {
			customer_id: command.identity.customerId,
			entity_id: command.identity.entityId ?? undefined,
			value: command.value,
			balance,
			deductions: trackReplyToDeductions({ reply, fullSubject }),
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Track,
		legacyData: { feature_id: command.featureId },
	});
}
