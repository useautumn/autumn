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
	const { command, result } = decision.mutation;
	if (command.type !== "track" || result.type !== "track")
		throw new RecaseError({
			message: "Balance worker returned a non-track mutation for a track",
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	if (result.status === "rejected") {
		throw new InsufficientBalanceError({
			featureId: command.featureId,
			value: result.requestedValue,
			balance: result.balanceBefore,
		});
	}
	return applyResponseVersionChanges<TrackResponseV3>({
		ctx,
		input: {
			customer_id: decision.mutation.identity.customerId,
			entity_id: command.entityId ?? undefined,
			value: result.requestedValue,
			balance: meteringBalanceToApiBalance({
				featureId: command.featureId,
				snapshot: result.balanceSnapshot,
			}),
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Track,
		legacyData: { feature_id: command.featureId },
	});
}
