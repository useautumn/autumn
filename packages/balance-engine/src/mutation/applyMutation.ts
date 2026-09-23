import {
	MutationSubjectMismatchError,
	OutOfOrderMutationError,
	SubjectStateMissingError,
} from "../errors.js";
import type { CustomerRowChange } from "../models/mutation/rowChange.js";
import type { SubjectStateMutation } from "../models/mutation/subjectStateMutation.js";
import type { SubjectState } from "../models/subject/subjectState.js";
import { isSameCustomerIdentity } from "../utils/identityUtils/classifyIdentityUtils.js";
import { applyChanges } from "./applyChanges.js";

/** Only a mutation that inserts the customer row can start a state: an initialize, or a plan that creates the customer. */
const emptyStateFor = ({
	mutation,
}: {
	mutation: SubjectStateMutation;
}): SubjectState => {
	const customerInsert = mutation.changes.find(
		(change): change is Extract<CustomerRowChange, { op: "insert" }> =>
			change.table === "customer" && change.op === "insert",
	);
	if (!customerInsert) {
		throw new SubjectStateMissingError();
	}
	return {
		schemaVersion: 1,
		identity: mutation.identity,
		revision: 0,
		customer: customerInsert.row,
		customerProducts: [],
		customerPrices: [],
		customerEntitlements: [],
		rollovers: [],
		usageWindows: [],
		openLocks: [],
		pooledBalances: [],
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

	return { ...changedState, revision: mutation.revision.after };
};
