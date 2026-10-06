import {
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type { SubjectSnapshotUpsert } from "@autumn/postgres";

/** One row per state the writer vouched for, serialized once here, then one per stale subject with no state at all;
 *  the partition is the call's, the offset the flush's last. */
export const upsertRowsOf = ({
	states,
	stale = [],
	baselineAt,
	partition,
	partitionCount,
	logOffset,
	logOffsets,
}: {
	states: readonly SubjectState[];
	stale?: readonly SubjectState[];
	baselineAt: number;
	partition: number;
	partitionCount: number;
	logOffset: bigint | null;
	logOffsets?: ReadonlyMap<string, bigint>;
}): SubjectSnapshotUpsert[] => [
	...states.map((state) => ({
		...rowKeyOf({ state, partition, partitionCount }),
		stateJson: JSON.stringify(state),
		baselineAt,
		logOffset:
			logOffsets?.get(
				meteringIdentityToSubjectKey({ identity: state.identity }),
			) ?? logOffset,
	})),
	...stale.map((state) => ({
		...rowKeyOf({ state, partition, partitionCount }),
		stateJson: "null",
		baselineAt,
		logOffset,
		stale: true,
	})),
];

const rowKeyOf = ({
	state,
	partition,
	partitionCount,
}: {
	state: SubjectState;
	partition: number;
	partitionCount: number;
}) => ({
	orgId: state.identity.orgId,
	env: state.identity.env,
	customerId: state.identity.customerId,
	entityId: state.identity.entityId,
	internalCustomerId: state.customer.internal_id,
	internalEntityId: state.entity?.internal_id ?? null,
	partition,
	partitionCount,
	stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
});
