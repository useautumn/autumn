import {
	type CustomerState,
	type MeteringIdentity,
	meteringPartitionKeyOf,
} from "@autumn/balance-engine";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import type { StoredSubjectState } from "../../types/storedSubjectState.js";
import {
	type SubjectStateRow,
	storedSubjectStateFromRow,
} from "./subjectStateRow.js";

const selectColumns = `
	partition_key AS partitionKey,
	topic,
	partition_id AS partition,
	revision,
	state_json AS stateJson
`;

export const readStoredState = ({
	ctx,
	identity,
}: {
	ctx: StateStoreContext;
	identity: MeteringIdentity;
}): StoredSubjectState | null => {
	const partitionKey = meteringPartitionKeyOf({ identity });
	const row = ctx.sqliteDb
		.query<SubjectStateRow, { partitionKey: string }>(`
			SELECT ${selectColumns}
			FROM subject_states
			WHERE partition_key = $partitionKey
		`)
		.get({ partitionKey });
	if (!row) return null;
	return storedSubjectStateFromRow({ row });
};

export const readPartitionStates = ({
	ctx,
	topic,
	partition,
	limit,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	limit: number;
}): Array<{ partitionKey: string } & StoredSubjectState> =>
	ctx.sqliteDb
		.query<
			SubjectStateRow,
			{ topic: string; partition: number; limit: number }
		>(`
			SELECT ${selectColumns}
			FROM subject_states
			WHERE topic = $topic AND partition_id = $partition
			ORDER BY partition_key
			LIMIT $limit
		`)
		.all({ topic, partition, limit })
		.map((row) => ({
			partitionKey: row.partitionKey,
			...storedSubjectStateFromRow({ row }),
		}));

export const insertState = ({
	ctx,
	partitionKey,
	topic,
	partition,
	state,
}: {
	ctx: StateStoreContext;
	partitionKey: string;
	topic: string;
	partition: number;
	state: CustomerState;
}) => {
	ctx.sqliteDb
		.query<
			never,
			{
				partitionKey: string;
				topic: string;
				partition: number;
				revision: bigint;
				stateJson: string;
			}
		>(`
			INSERT INTO subject_states (
				partition_key,
				topic,
				partition_id,
				revision,
				state_json
			)
			VALUES ($partitionKey, $topic, $partition, $revision, $stateJson)
		`)
		.run({
			partitionKey,
			topic,
			partition,
			revision: BigInt(state.revision),
			stateJson: JSON.stringify(state),
		});
};

export const updateState = ({
	ctx,
	partitionKey,
	revisionBefore,
	state,
}: {
	ctx: StateStoreContext;
	partitionKey: string;
	revisionBefore: number;
	state: CustomerState;
}) =>
	ctx.sqliteDb
		.query<
			never,
			{
				partitionKey: string;
				revisionBefore: bigint;
				revisionAfter: bigint;
				stateJson: string;
			}
		>(`
			UPDATE subject_states
			SET revision = $revisionAfter, state_json = $stateJson
			WHERE partition_key = $partitionKey AND revision = $revisionBefore
		`)
		.run({
			partitionKey,
			revisionBefore: BigInt(revisionBefore),
			revisionAfter: BigInt(state.revision),
			stateJson: JSON.stringify(state),
		});
