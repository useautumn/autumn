import { isDeepStrictEqual } from "node:util";
import { Decimal } from "decimal.js";
import { balanceOf } from "../../../common/balanceUtils.js";
import { identitiesMatch } from "../../../common/identityUtils.js";
import type { CustomerMeteringState } from "../../../common/types/customerState/customerStateTypes.js";
import {
	ConflictingTrackReceiptError,
	OutOfOrderTrackOutcomeError,
	StaleTrackOutcomeError,
	TrackOutcomeSubjectMismatchError,
} from "../errors/trackErrors.js";
import {
	type TrackOutcome,
	trackOutcomeSchema,
} from "../types/trackOutcome.js";
import { applyBalanceMutations } from "./applyBalanceMutations.js";

// The fold boundary: runs only after the outcome is durable, re-validates
// everything the decision assumed, and advances state by exactly one revision.
export const executeTrack = ({
	state,
	outcome,
	existingReceipt = null,
}: {
	state: CustomerMeteringState;
	outcome: TrackOutcome;
	existingReceipt?: TrackOutcome | null;
}): {
	kind: "applied" | "duplicate";
	state: CustomerMeteringState;
	receipt: TrackOutcome;
} => {
	const parsedOutcome = trackOutcomeSchema.parse(outcome);

	if (
		!identitiesMatch({ left: state.identity, right: parsedOutcome.identity })
	) {
		throw new TrackOutcomeSubjectMismatchError();
	}

	if (existingReceipt) {
		const parsedReceipt = trackOutcomeSchema.parse(existingReceipt);
		if (!isDeepStrictEqual(parsedReceipt, parsedOutcome)) {
			throw new ConflictingTrackReceiptError({
				commandId: parsedOutcome.commandId,
			});
		}
		return { kind: "duplicate", state, receipt: parsedReceipt };
	}

	if (
		parsedOutcome.revisionBefore !== state.revision ||
		parsedOutcome.revisionAfter !== state.revision + 1
	) {
		throw new OutOfOrderTrackOutcomeError({
			stateRevision: state.revision,
			outcomeRevision: parsedOutcome.revisionBefore,
		});
	}

	const customerEntitlements =
		state.customerEntitlementsByFeatureId[parsedOutcome.featureId];
	if (!customerEntitlements) {
		throw new StaleTrackOutcomeError({ subject: parsedOutcome.featureId });
	}
	if (
		!new Decimal(balanceOf({ customerEntitlements })).eq(
			parsedOutcome.balanceBefore,
		)
	) {
		throw new StaleTrackOutcomeError({ subject: parsedOutcome.featureId });
	}

	const nextCustomerEntitlements = applyBalanceMutations({
		customerEntitlements,
		mutations: parsedOutcome.mutations,
	});
	if (
		!new Decimal(
			balanceOf({ customerEntitlements: nextCustomerEntitlements }),
		).eq(parsedOutcome.balanceAfter)
	) {
		throw new StaleTrackOutcomeError({ subject: parsedOutcome.featureId });
	}
	const nextState: CustomerMeteringState = {
		schemaVersion: 1,
		identity: state.identity,
		revision: parsedOutcome.revisionAfter,
		customerEntitlementsByFeatureId:
			parsedOutcome.mutations.length === 0
				? state.customerEntitlementsByFeatureId
				: {
						...state.customerEntitlementsByFeatureId,
						[parsedOutcome.featureId]: nextCustomerEntitlements,
					},
	};

	return { kind: "applied", state: nextState, receipt: parsedOutcome };
};
