import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type { SubjectSnapshotUpsert } from "@autumn/postgres";
import type { CustomerSnapshots, HeldSubject } from "./customerSnapshots.js";

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
