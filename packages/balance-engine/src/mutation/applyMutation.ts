import {
	MutationSubjectMismatchError,
	OutOfOrderMutationError,
	SubjectStateMissingError,
} from "../errors.js";
import type { SubjectState } from "../models/subjectState.js";
import type { SubjectStateMutation } from "../models/subjectStateMutation.js";
import { isSameCustomerIdentity } from "../utils/identityUtils/classifyIdentityUtils.js";
import { applyChanges } from "./applyChanges.js";

/** Only an initialize can start a state: it is the mutation that names the subject. */
const emptyStateFor = ({
	mutation,
}: {
	mutation: SubjectStateMutation;
}): SubjectState => {
	if (mutation.command.type !== "initialize") {
		throw new SubjectStateMissingError();
	}
	return {
		schemaVersion: 1,
		identity: mutation.identity,
		revision: 0,
		customer: mutation.command.customer,
		customerProducts: [],
		customerEntitlements: [],
		rollovers: [],
		entity: null,
	};
};

export const applyMutation = ({
	state,
	mutation,
}: {
	state: SubjectState | null;
	mutation: SubjectStateMutation;
}): SubjectState => {
	if (
		state &&
		!isSameCustomerIdentity({ left: state.identity, right: mutation.identity })
	) {
		throw new MutationSubjectMismatchError();
	}

	// No state is revision 0: a customer initialize is the mutation that leaves it.
	// An entity initialize inserts into whatever revision the customer is at.
	const stateRevision = state?.revision ?? 0;
	const reinitializesCustomer =
		mutation.command.type === "initialize" &&
		mutation.identity.entityId === null &&
		state !== null;
	if (stateRevision !== mutation.revision.before || reinitializesCustomer) {
		throw new OutOfOrderMutationError({
			stateRevision,
			mutationRevision: mutation.revision.before,
		});
	}

	const currentState = state ?? emptyStateFor({ mutation });
	const changedState = applyChanges({
		state: currentState,
		changes: mutation.changes,
	});
	// The entity is not a table row: the initialize that admits it names it once.
	const entity =
		mutation.command.type === "initialize"
			? mutation.command.entity
			: currentState.entity;

	return { ...changedState, entity, revision: mutation.revision.after };
};
