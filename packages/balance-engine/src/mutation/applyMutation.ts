import {
	MutationSubjectMismatchError,
	OutOfOrderMutationError,
} from "../errors.js";
import type { SubjectState } from "../models/subjectState.js";
import type { SubjectStateMutation } from "../models/subjectStateMutation.js";
import { identitiesMatch } from "../utils/identityUtils/identitiesMatch.js";
import { applyChanges } from "./applyChanges.js";

export const applyMutation = ({
	state,
	mutation,
}: {
	state: SubjectState | null;
	mutation: SubjectStateMutation;
}): SubjectState => {
	if (
		state &&
		!identitiesMatch({ left: state.identity, right: mutation.identity })
	) {
		throw new MutationSubjectMismatchError();
	}

	// No state is revision 0: an initialize is the mutation that leaves it.
	const stateRevision = state?.revision ?? 0;
	const initializesExistingState =
		mutation.command.type === "initialize" && state !== null;
	if (stateRevision !== mutation.revision.before || initializesExistingState) {
		throw new OutOfOrderMutationError({
			stateRevision,
			mutationRevision: mutation.revision.before,
		});
	}

	const currentState: SubjectState = state ?? {
		schemaVersion: 1,
		identity: mutation.identity,
		revision: 0,
		customerProducts: [],
		customerEntitlements: [],
		rollovers: [],
		entities: [],
	};
	const changedState = applyChanges({
		state: currentState,
		changes: mutation.changes,
	});

	return { ...changedState, revision: mutation.revision.after };
};
