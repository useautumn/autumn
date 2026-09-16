import {
	type CustomerMeteringState,
	type MeteringIdentity,
	meteringPartitionKeyOf,
} from "@autumn/balance-engine";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import type { StoredMeteringState } from "../../types/storedMeteringState.js";

import { type StateRow, storedStateFromRow } from "./customerStateRow.js";

export const readStoredState = ({
	ctx,
	identity,
}: {
	ctx: StateStoreContext;
	identity: MeteringIdentity;
}): StoredMeteringState | null => {
	const partitionKey = meteringPartitionKeyOf({ identity });
	const row = ctx.sqliteDb
		.query<StateRow, { partitionKey: string }>(`
			SELECT
				partition_key AS partitionKey,
				topic,
				partition_id AS partition,
				initialization_id AS initializationId,
				initialization_fingerprint AS initializationFingerprint,
				revision,
				state_json AS stateJson
			FROM customer_states
			WHERE partition_key = $partitionKey
		`)
		.get({ partitionKey });
	if (!row) return null;
	return storedStateFromRow({ row });
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
}): Array<{ partitionKey: string } & StoredMeteringState> =>
	ctx.sqliteDb
		.query<StateRow, { topic: string; partition: number; limit: number }>(`
			SELECT
				partition_key AS partitionKey,
				topic,
				partition_id AS partition,
				initialization_id AS initializationId,
				initialization_fingerprint AS initializationFingerprint,
				revision,
				state_json AS stateJson
			FROM customer_states
			WHERE topic = $topic AND partition_id = $partition
			ORDER BY partition_key
			LIMIT $limit
		`)
		.all({ topic, partition, limit })
		.map((row) => ({
			partitionKey: row.partitionKey,
			...storedStateFromRow({ row }),
		}));

export const insertState = ({
	ctx,
	partitionKey,
	topic,
	partition,
	initializationId,
	initializationFingerprint,
	state,
}: {
	ctx: StateStoreContext;
	partitionKey: string;
	topic: string;
	partition: number;
	initializationId: string;
	initializationFingerprint: string;
	state: CustomerMeteringState;
}) => {
	ctx.sqliteDb
		.query<
			never,
			{
				partitionKey: string;
				topic: string;
				partition: number;
				initializationId: string;
				initializationFingerprint: string;
				revision: bigint;
				stateJson: string;
			}
		>(`
			INSERT INTO customer_states (
				partition_key,
				topic,
				partition_id,
				initialization_id,
				initialization_fingerprint,
				revision,
				state_json
			)
			VALUES (
				$partitionKey,
				$topic,
				$partition,
				$initializationId,
				$initializationFingerprint,
				$revision,
				$stateJson
			)
		`)
		.run({
			partitionKey,
			topic,
			partition,
			initializationId,
			initializationFingerprint,
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
	state: CustomerMeteringState;
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
			UPDATE customer_states
			SET revision = $revisionAfter, state_json = $stateJson
			WHERE partition_key = $partitionKey AND revision = $revisionBefore
		`)
		.run({
			partitionKey,
			revisionBefore: BigInt(revisionBefore),
			revisionAfter: BigInt(state.revision),
			stateJson: JSON.stringify(state),
		});
