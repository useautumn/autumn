import {
	MutationSubjectMismatchError,
	OutOfOrderMutationError,
} from "../errors.js";
import type { CustomerState } from "../models/customerState.js";
import type { CustomerStateMutation } from "../models/customerStateMutation.js";
import { identitiesMatch } from "../utils/identityUtils/identitiesMatch.js";
import { applyChanges } from "./applyChanges.js";

export const applyMutation = ({
	state,
	mutation,
}: {
	state: CustomerState | null;
	mutation: CustomerStateMutation;
}): CustomerState => {
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

	const currentState: CustomerState = state ?? {
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
