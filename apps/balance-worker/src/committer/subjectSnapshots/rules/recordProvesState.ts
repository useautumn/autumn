import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import type { DurableMutationRecord } from "../../../state/types/durableMutation.js";

/** A record proves its subjects' state when it carried payloads, each the record's own subject, from a statement that saw their rows. */
export const recordProvesState = ({
	record,
}: {
	record: DurableMutationRecord;
}): boolean => {
	const payloads = record.snapshots ?? [];
	const { identity } = record.mutation;
	return (
		payloads.length > 0 &&
		!recordCreatesSubject({ record }) &&
		payloads.every(({ state }) => isOwnSubject({ state, identity }))
	);
};

/** The statement's own snapshot cannot see a customer or entity row the same statement inserts. */
const recordCreatesSubject = ({
	record,
}: {
	record: DurableMutationRecord;
}): boolean =>
	record.mutation.changes.some(
		(change) =>
			(change.table === "customer" || change.table === "entity") &&
			change.op === "insert",
	);

const isOwnSubject = ({
	state,
	identity,
}: {
	state: SubjectState;
	identity: MeteringIdentity;
}): boolean =>
	state.identity.orgId === identity.orgId &&
	state.identity.env === identity.env &&
	state.identity.customerId === identity.customerId &&
	(state.identity.entityId === null || state.entity !== null);
