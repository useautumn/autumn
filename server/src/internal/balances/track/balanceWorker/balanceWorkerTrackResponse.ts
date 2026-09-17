import type { TrackDecision } from "@autumn/balance-engine";
import {
	AffectedResource,
	applyResponseVersionChanges,
	ErrCode,
	InsufficientBalanceError,
	RecaseError,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { meteringBalanceToApiBalance } from "../../balanceWorker/meteringBalanceToApiBalance.js";

export function trackDecisionToTrackResponse({
	ctx,
	decision,
}: {
	ctx: AutumnContext;
	decision: TrackDecision;
}): TrackResponseV3 {
	if (decision.kind === "unsupported") {
		const isCommandConflict = decision.reason === "command_conflict";
		throw new RecaseError({
			message: `Balance worker track is unsupported: ${decision.reason}`,
			code: isCommandConflict
				? ErrCode.DuplicateIdempotencyKey
				: ErrCode.InvalidRequest,
			statusCode: isCommandConflict ? 409 : 400,
		});
	}
	const outcome = decision.outcome;
	if (outcome.status === "rejected") {
		throw new InsufficientBalanceError({
			featureId: outcome.featureId,
			value: outcome.requestedValue,
			balance: outcome.balanceBefore,
		});
	}
	return applyResponseVersionChanges<TrackResponseV3>({
		ctx,
		input: {
			customer_id: outcome.identity.customerId,
			entity_id: outcome.entityId ?? undefined,
			value: outcome.requestedValue,
			balance: meteringBalanceToApiBalance({
				featureId: outcome.featureId,
				snapshot: outcome.balanceSnapshot,
			}),
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Track,
		legacyData: { feature_id: outcome.featureId },
	});
}
