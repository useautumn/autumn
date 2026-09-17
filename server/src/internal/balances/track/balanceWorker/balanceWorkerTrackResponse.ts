import type { TrackDecision } from "@autumn/balance-engine";
import type { FullSubject } from "@autumn/shared";
import {
	AffectedResource,
	applyResponseVersionChanges,
	ErrCode,
	InsufficientBalanceError,
	RecaseError,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { workerCustomerEntitlementToApiBalance } from "../../balanceWorker/workerCustomerEntitlementToApiBalance.js";

export function trackDecisionToTrackResponse({
	ctx,
	decision,
	fullSubject,
}: {
	ctx: AutumnContext;
	decision: TrackDecision;
	fullSubject: FullSubject;
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
			entity_id: decision.mutation.identity.entityId ?? undefined,
			value: result.requestedValue,
			balance: workerCustomerEntitlementToApiBalance({
				ctx,
				fullSubject,
				customerEntitlement: result.customerEntitlement,
			}),
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Track,
		legacyData: { feature_id: command.featureId },
	});
}
