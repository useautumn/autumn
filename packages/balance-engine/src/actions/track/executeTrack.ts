import { isDeepStrictEqual } from "node:util";
import { Decimal } from "decimal.js";
import { parseTrackOutcome } from "../../common/parsers.js";
import { balanceOf, identitiesMatch } from "../../common/state.js";
import type { CustomerMeteringState, TrackOutcome } from "../../contracts.js";
import { applyDeduction } from "../../deduction/applyDeduction.js";
import {
	ConflictingTrackReceiptError,
	OutOfOrderTrackOutcomeError,
	StaleTrackOutcomeError,
	TrackOutcomeSubjectMismatchError,
} from "./errors.js";

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
	const parsedOutcome = parseTrackOutcome({ input: outcome });

	if (
		!identitiesMatch({ left: state.identity, right: parsedOutcome.identity })
	) {
		throw new TrackOutcomeSubjectMismatchError();
	}

	if (existingReceipt) {
		const parsedReceipt = parseTrackOutcome({ input: existingReceipt });
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

	const featureState = Object.hasOwn(
		state.featureStatesById,
		parsedOutcome.featureId,
	)
		? state.featureStatesById[parsedOutcome.featureId]
		: undefined;
	if (!featureState) {
		throw new StaleTrackOutcomeError({
			subject: parsedOutcome.featureId,
		});
	}
	if (
		!new Decimal(balanceOf({ featureState })).eq(parsedOutcome.balanceBefore)
	) {
		throw new StaleTrackOutcomeError({
			subject: parsedOutcome.featureId,
		});
	}

	const nextCustomerEntitlements = applyDeduction({
		customerEntitlements: featureState.customerEntitlements,
		mutations: parsedOutcome.mutations,
	});
	const nextFeatureState = {
		kind: "direct_metered_v1" as const,
		customerEntitlements: nextCustomerEntitlements,
	};
	if (
		!new Decimal(balanceOf({ featureState: nextFeatureState })).eq(
			parsedOutcome.balanceAfter,
		)
	) {
		throw new StaleTrackOutcomeError({
			subject: parsedOutcome.featureId,
		});
	}

	const nextState: CustomerMeteringState = {
		schemaVersion: 1,
		identity: state.identity,
		revision: parsedOutcome.revisionAfter,
		featureStatesById:
			parsedOutcome.mutations.length === 0
				? state.featureStatesById
				: {
						...state.featureStatesById,
						[parsedOutcome.featureId]: nextFeatureState,
					},
	};

	return { kind: "applied", state: nextState, receipt: parsedOutcome };
};
