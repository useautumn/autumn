import {
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type { SubjectSnapshotUpsert } from "@autumn/postgres";

/** One row per state the writer vouched for, serialized once here; the partition is the call's, the offset the flush's last. */
export const upsertRowsOf = ({
	states,
	baselineAt,
	partition,
	partitionCount,
	logOffset,
	logOffsets,
}: {
	states: readonly SubjectState[];
	baselineAt: number;
	partition: number;
	partitionCount: number;
	logOffset: bigint | null;
	logOffsets?: ReadonlyMap<string, bigint>;
}): SubjectSnapshotUpsert[] =>
	states.map((state) => ({
		orgId: state.identity.orgId,
		env: state.identity.env,
		customerId: state.identity.customerId,
		entityId: state.identity.entityId,
		internalCustomerId: state.customer.internal_id,
		internalEntityId: state.entity?.internal_id ?? null,
		partition,
		partitionCount,
		stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
		stateJson: JSON.stringify(state),
		baselineAt,
		logOffset:
			logOffsets?.get(
				meteringIdentityToSubjectKey({ identity: state.identity }),
			) ?? logOffset,
	}));
