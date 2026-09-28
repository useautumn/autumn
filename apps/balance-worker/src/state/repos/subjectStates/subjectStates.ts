import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { CorruptBalanceStateError } from "../../stateStoreErrors.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import type {
	StoredSubjectState,
	StoredSubjectStates,
} from "../../types/storedSubjectState.js";
import {
	type SubjectStateRow,
	storedSubjectStateFromRow,
} from "./subjectStateRow.js";

const selectColumns = `
	subject_key AS subjectKey,
	partition_key AS partitionKey,
	topic,
	partition_id AS partition,
	revision,
	state_json AS stateJson
`;

export const readStoredState = ({
	ctx,
	subjectKey,
}: {
	ctx: StateStoreContext;
	subjectKey: string;
}): StoredSubjectState | null => {
	const row = ctx.sqliteDb
		.query<SubjectStateRow, { subjectKey: string }>(`
			SELECT ${selectColumns}
			FROM subject_states
			WHERE subject_key = $subjectKey
		`)
		.get({ subjectKey });
	if (!row) return null;
	return storedSubjectStateFromRow({ row });
};

/** Null until the customer has state; an entity state without its customer is corruption. */
export const readStoredStates = ({
	ctx,
	identity,
}: {
	ctx: StateStoreContext;
	identity: MeteringIdentity;
}): StoredSubjectStates | null => {
	const customerKey = meteringIdentityToPartitionKey({ identity });
	const customer = readStoredState({ ctx, subjectKey: customerKey });
	const entity = identity.entityId
		? readStoredState({
				ctx,
				subjectKey: meteringIdentityToSubjectKey({ identity }),
			})
		: null;
	if (!customer) {
		if (entity)
			throw new CorruptBalanceStateError({ partitionKey: customerKey });
		return null;
	}
	if (
		entity &&
		(entity.topic !== customer.topic || entity.partition !== customer.partition)
	) {
		throw new CorruptBalanceStateError({ partitionKey: customerKey });
	}
	return {
		topic: customer.topic,
		partition: customer.partition,
		customer: customer.state,
		entity: entity?.state ?? null,
	};
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
}): Array<{ subjectKey: string } & StoredSubjectState> =>
	ctx.sqliteDb
		.query<
			SubjectStateRow,
			{ topic: string; partition: number; limit: number }
		>(`
			SELECT ${selectColumns}
			FROM subject_states
			WHERE topic = $topic AND partition_id = $partition
			ORDER BY subject_key
			LIMIT $limit
		`)
		.all({ topic, partition, limit })
		.map((row) => ({
			subjectKey: row.subjectKey,
			...storedSubjectStateFromRow({ row }),
		}));

/** Keys derive from the state's identity, so a state can never be filed under another subject. */
export const insertState = ({
	ctx,
	topic,
	partition,
	state,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	state: SubjectState;
}) => {
	ctx.sqliteDb
		.query<
			never,
			{
				subjectKey: string;
				partitionKey: string;
				topic: string;
				partition: number;
				revision: bigint;
				stateJson: string;
			}
		>(`
			INSERT INTO subject_states (
				subject_key,
				partition_key,
				topic,
				partition_id,
				revision,
				state_json
			)
			VALUES ($subjectKey, $partitionKey, $topic, $partition, $revision, $stateJson)
		`)
		.run({
			subjectKey: meteringIdentityToSubjectKey({ identity: state.identity }),
			partitionKey: meteringIdentityToPartitionKey({
				identity: state.identity,
			}),
			topic,
			partition,
			revision: BigInt(state.revision),
			stateJson: JSON.stringify(state),
		});
};

/** The customer's state carries the revision guard; entity states ride along under it, so they update unguarded. */
export const updateState = ({
	ctx,
	state,
	revisionBefore = null,
}: {
	ctx: StateStoreContext;
	state: SubjectState;
	revisionBefore?: number | null;
}) =>
	ctx.sqliteDb
		.query<
			never,
			{
				subjectKey: string;
				revisionBefore: bigint;
				revisionAfter: bigint;
				stateJson: string;
			}
		>(`
			UPDATE subject_states
			SET revision = $revisionAfter, state_json = $stateJson
			WHERE subject_key = $subjectKey
				AND ($revisionBefore < 0 OR revision = $revisionBefore)
		`)
		.run({
			subjectKey: meteringIdentityToSubjectKey({ identity: state.identity }),
			revisionBefore: BigInt(revisionBefore ?? -1),
			revisionAfter: BigInt(state.revision),
			stateJson: JSON.stringify(state),
		});
