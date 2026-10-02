import type { MeteringIdentity } from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type {
	SubjectSnapshotClaim,
	SubjectSnapshotCustomer,
	SubjectSnapshotDelete,
	SubjectSnapshotUpsert,
} from "@autumn/postgres";
import type {
	DurableMutationRecord,
	SubjectSnapshotPayload,
} from "../../state/types/durableMutation.js";
import type { FlushCall } from "../types/committer.js";

/** A subject's last proven state in the flush and the log position that proved it. */
export type HeldSubject = {
	payload: SubjectSnapshotPayload;
	partition: number;
	logOffset: bigint;
};

/** Everything one flush says about a customer: the last state of each subject, unless any record forces a delete. */
export type CustomerSnapshots = {
	customer: SubjectSnapshotCustomer;
	subjects: Map<string, HeldSubject>;
	deletes: boolean;
	/** Set by a drop and cleared by any record of the customer, whose bookmark proves ownership instead. */
	claim?: SubjectSnapshotClaim;
};

export const customerOf = ({
	identity,
}: {
	identity: MeteringIdentity;
}): SubjectSnapshotCustomer => ({
	orgId: identity.orgId,
	env: identity.env,
	customerId: identity.customerId,
});

const customerKeyOf = ({ customer }: { customer: SubjectSnapshotCustomer }) =>
	JSON.stringify([customer.orgId, customer.env, customer.customerId]);

const subjectKeyOf = ({ identity }: { identity: MeteringIdentity }) =>
	identity.entityId ?? "";

export const customerEntryOf = ({
	byCustomer,
	customer,
}: {
	byCustomer: Map<string, CustomerSnapshots>;
	customer: SubjectSnapshotCustomer;
}): CustomerSnapshots => {
	const key = customerKeyOf({ customer });
	const existing = byCustomer.get(key);
	if (existing) return existing;
	const created = { customer, subjects: new Map(), deletes: false };
	byCustomer.set(key, created);
	return created;
};

/** Undefined for a call that holds no claim, so a drop keeps the claim an earlier drop was asked under. */
export const claimOf = ({
	call,
}: {
	call: FlushCall;
}): SubjectSnapshotClaim | undefined =>
	call.claimToken === undefined
		? undefined
		: {
				topic: call.topic,
				partition: call.partition,
				claimToken: call.claimToken,
			};

/** A later record of the same subject replaces the state an earlier one held. */
export const holdSubjectStates = ({
	entry,
	call,
	record,
}: {
	entry: CustomerSnapshots;
	call: FlushCall;
	record: DurableMutationRecord;
}): void => {
	for (const payload of record.snapshots ?? [])
		entry.subjects.set(subjectKeyOf({ identity: payload.state.identity }), {
			payload,
			partition: call.partition,
			logOffset: record.position.offset,
		});
};

export const upsertRowsOf = ({
	entry,
	partitionCount,
}: {
	entry: CustomerSnapshots;
	partitionCount: number;
}): SubjectSnapshotUpsert[] =>
	[...entry.subjects.values()].map((held) =>
		upsertRowOf({ held, partitionCount }),
	);

const upsertRowOf = ({
	held,
	partitionCount,
}: {
	held: HeldSubject;
	partitionCount: number;
}): SubjectSnapshotUpsert => {
	const { state, baselineAt } = held.payload;
	return {
		orgId: state.identity.orgId,
		env: state.identity.env,
		customerId: state.identity.customerId,
		entityId: state.identity.entityId,
		internalCustomerId: state.customer.internal_id,
		internalEntityId: state.entity?.internal_id ?? null,
		partition: held.partition,
		partitionCount,
		stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
		stateJson: JSON.stringify(state),
		baselineAt,
		logOffset: held.logOffset,
	};
};

export const deleteRowOf = ({
	customer,
	claim,
}: {
	customer: SubjectSnapshotCustomer;
	claim?: SubjectSnapshotClaim;
}): SubjectSnapshotDelete => (claim ? { ...customer, claim } : customer);
