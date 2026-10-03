import type { MeteringIdentity } from "@autumn/balance-engine";
import type { SubjectSnapshotCustomer } from "@autumn/postgres";
import type {
	DurableMutationRecord,
	SubjectSnapshotPayload,
} from "../../../state/types/durableMutation.js";
import type { FlushCall } from "../../types/committer.js";

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
