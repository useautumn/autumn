import type { Database } from "bun:sqlite";
import {
	type MeteringIdentity,
	type MeteringState,
	meteringPartitionKeyOf,
	meteringStateSchema,
	type TrackOutcome,
	trackOutcomeSchema,
} from "@autumn/balance-engine";
import { CorruptBalanceStateError } from "./sqliteBalanceStateErrors.js";

type StateRow = {
	revision: bigint;
	stateJson: string;
};

type ReceiptRow = {
	outcomeJson: string;
};

type PartitionProgressRow = {
	nextOffset: bigint;
};

export const readState = ({
	database,
	identity,
}: {
	database: Database;
	identity: MeteringIdentity;
}): MeteringState | null => {
	const partitionKey = meteringPartitionKeyOf({ identity });
	const row = database
		.query<StateRow, { partitionKey: string }>(`
			SELECT revision, state_json AS stateJson
			FROM customer_states
			WHERE partition_key = $partitionKey
		`)
		.get({ partitionKey });
	if (!row) return null;

	const state = meteringStateSchema.parse(JSON.parse(row.stateJson));
	if (
		BigInt(state.revision) !== row.revision ||
		meteringPartitionKeyOf({ identity: state.identity }) !== partitionKey
	) {
		throw new CorruptBalanceStateError({ partitionKey });
	}
	return state;
};

export const readTrackReceipt = ({
	database,
	identity,
	commandId,
}: {
	database: Database;
	identity: MeteringIdentity;
	commandId: string;
}): TrackOutcome | null => {
	const partitionKey = meteringPartitionKeyOf({ identity });
	const row = database
		.query<ReceiptRow, { partitionKey: string; commandId: string }>(`
			SELECT outcome_json AS outcomeJson
			FROM track_receipts
			WHERE partition_key = $partitionKey AND command_id = $commandId
		`)
		.get({ partitionKey, commandId });
	if (!row) return null;

	const outcome = trackOutcomeSchema.parse(JSON.parse(row.outcomeJson));
	if (
		outcome.commandId !== commandId ||
		meteringPartitionKeyOf({ identity: outcome.identity }) !== partitionKey
	) {
		throw new CorruptBalanceStateError({ partitionKey });
	}
	return outcome;
};

export const readNextOffset = ({
	database,
	topic,
	partition,
}: {
	database: Database;
	topic: string;
	partition: number;
}): bigint | null => {
	const row = database
		.query<PartitionProgressRow, { topic: string; partition: number }>(`
			SELECT next_offset AS nextOffset
			FROM partition_progress
			WHERE topic = $topic AND partition_id = $partition
		`)
		.get({ topic, partition });
	return row?.nextOffset ?? null;
};

export const insertPartitionProgress = ({
	database,
	topic,
	partition,
	nextOffset,
}: {
	database: Database;
	topic: string;
	partition: number;
	nextOffset: bigint;
}) => {
	database
		.query<never, { topic: string; partition: number; nextOffset: bigint }>(`
			INSERT INTO partition_progress (topic, partition_id, next_offset)
			VALUES ($topic, $partition, $nextOffset)
		`)
		.run({ topic, partition, nextOffset });
};

export const insertState = ({
	database,
	partitionKey,
	state,
}: {
	database: Database;
	partitionKey: string;
	state: MeteringState;
}) => {
	database
		.query<
			never,
			{ partitionKey: string; revision: bigint; stateJson: string }
		>(`
			INSERT INTO customer_states (partition_key, revision, state_json)
			VALUES ($partitionKey, $revision, $stateJson)
		`)
		.run({
			partitionKey,
			revision: BigInt(state.revision),
			stateJson: JSON.stringify(state),
		});
};

export const updateState = ({
	database,
	partitionKey,
	revisionBefore,
	state,
}: {
	database: Database;
	partitionKey: string;
	revisionBefore: number;
	state: MeteringState;
}) =>
	database
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

export const insertTrackReceipt = ({
	database,
	partitionKey,
	position,
	receipt,
}: {
	database: Database;
	partitionKey: string;
	position: { topic: string; partition: number; offset: bigint };
	receipt: TrackOutcome;
}) => {
	database
		.query<
			never,
			{
				partitionKey: string;
				commandId: string;
				topic: string;
				partition: number;
				offset: bigint;
				outcomeJson: string;
			}
		>(`
			INSERT INTO track_receipts (
				partition_key,
				command_id,
				topic,
				partition_id,
				record_offset,
				outcome_json
			)
			VALUES (
				$partitionKey,
				$commandId,
				$topic,
				$partition,
				$offset,
				$outcomeJson
			)
		`)
		.run({
			partitionKey,
			commandId: receipt.commandId,
			topic: position.topic,
			partition: position.partition,
			offset: position.offset,
			outcomeJson: JSON.stringify(receipt),
		});
};

export const advancePartitionProgress = ({
	database,
	topic,
	partition,
	expectedOffset,
	nextOffset,
}: {
	database: Database;
	topic: string;
	partition: number;
	expectedOffset: bigint;
	nextOffset: bigint;
}) =>
	database
		.query<
			never,
			{
				topic: string;
				partition: number;
				expectedOffset: bigint;
				nextOffset: bigint;
			}
		>(`
			UPDATE partition_progress
			SET next_offset = $nextOffset
			WHERE topic = $topic
				AND partition_id = $partition
				AND next_offset = $expectedOffset
		`)
		.run({ topic, partition, expectedOffset, nextOffset });
