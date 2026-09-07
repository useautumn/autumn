import type { Database } from "bun:sqlite";
import {
	type CustomerMeteringState,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	parseCustomerMeteringState,
	parseTrackOutcome,
	type TrackOutcome,
} from "@autumn/balance-engine";
import { CorruptBalanceStateError } from "./sqliteBalanceStateErrors.js";

type StateRow = {
	partitionKey: string;
	topic: string;
	partition: bigint;
	initializationId: string;
	initializationFingerprint: string;
	revision: bigint;
	stateJson: string;
};

export type StoredMeteringState = {
	topic: string;
	partition: number;
	initializationId: string;
	initializationFingerprint: string;
	state: CustomerMeteringState;
};

type ReceiptRow = {
	partitionKey: string;
	commandId: string;
	topic: string;
	partition: bigint;
	recordOffset: bigint;
	deduplicationExpiresAt: bigint;
	outcomeJson: string;
};

type PartitionProgressRow = {
	nextOffset: bigint;
};

export type StoredPartitionReceipt = {
	partitionKey: string;
	recordOffset: bigint;
	outcome: TrackOutcome;
};

const storedStateFromRow = ({
	row,
}: {
	row: StateRow;
}): StoredMeteringState => {
	const state = parseCustomerMeteringState({
		input: JSON.parse(row.stateJson),
	});
	if (
		BigInt(state.revision) !== row.revision ||
		meteringPartitionKeyOf({ identity: state.identity }) !== row.partitionKey ||
		row.topic.trim().length === 0 ||
		row.partition < 0n ||
		row.partition > BigInt(Number.MAX_SAFE_INTEGER) ||
		row.initializationId.length === 0 ||
		row.initializationFingerprint.length === 0
	) {
		throw new CorruptBalanceStateError({ partitionKey: row.partitionKey });
	}
	return {
		topic: row.topic,
		partition: Number(row.partition),
		initializationId: row.initializationId,
		initializationFingerprint: row.initializationFingerprint,
		state,
	};
};

const storedReceiptFromRow = ({
	row,
}: {
	row: ReceiptRow;
}): StoredPartitionReceipt => {
	const outcome = parseTrackOutcome({ input: JSON.parse(row.outcomeJson) });
	if (
		outcome.commandId !== row.commandId ||
		meteringPartitionKeyOf({ identity: outcome.identity }) !==
			row.partitionKey ||
		BigInt(outcome.deduplicationExpiresAt) !== row.deduplicationExpiresAt ||
		row.topic.trim().length === 0 ||
		row.partition < 0n ||
		row.partition > BigInt(Number.MAX_SAFE_INTEGER) ||
		row.recordOffset < 0n
	) {
		throw new CorruptBalanceStateError({ partitionKey: row.partitionKey });
	}
	return {
		partitionKey: row.partitionKey,
		recordOffset: row.recordOffset,
		outcome,
	};
};

export const readStoredState = ({
	database,
	identity,
}: {
	database: Database;
	identity: MeteringIdentity;
}): StoredMeteringState | null => {
	const partitionKey = meteringPartitionKeyOf({ identity });
	const row = database
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
	database,
	topic,
	partition,
	limit,
}: {
	database: Database;
	topic: string;
	partition: number;
	limit: number;
}): Array<{ partitionKey: string } & StoredMeteringState> =>
	database
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

export const readState = ({
	database,
	identity,
}: {
	database: Database;
	identity: MeteringIdentity;
}): CustomerMeteringState | null =>
	readStoredState({ database, identity })?.state ?? null;

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
			SELECT
				partition_key AS partitionKey,
				command_id AS commandId,
				topic,
				partition_id AS partition,
				record_offset AS recordOffset,
				deduplication_expires_at AS deduplicationExpiresAt,
				outcome_json AS outcomeJson
			FROM track_receipts
			WHERE partition_key = $partitionKey AND command_id = $commandId
		`)
		.get({ partitionKey, commandId });
	if (!row) return null;
	return storedReceiptFromRow({ row }).outcome;
};

export const readPartitionReceipts = ({
	database,
	topic,
	partition,
	createdAt,
	limit,
}: {
	database: Database;
	topic: string;
	partition: number;
	createdAt: number;
	limit: number;
}): StoredPartitionReceipt[] =>
	database
		.query<
			ReceiptRow,
			{ topic: string; partition: number; createdAt: bigint; limit: number }
		>(`
			SELECT
				partition_key AS partitionKey,
				command_id AS commandId,
				topic,
				partition_id AS partition,
				record_offset AS recordOffset,
				deduplication_expires_at AS deduplicationExpiresAt,
				outcome_json AS outcomeJson
			FROM track_receipts
			WHERE topic = $topic
				AND partition_id = $partition
				AND deduplication_expires_at > $createdAt
			ORDER BY record_offset
			LIMIT $limit
		`)
		.all({ topic, partition, createdAt: BigInt(createdAt), limit })
		.map((row) => storedReceiptFromRow({ row }));

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
	topic,
	partition,
	initializationId,
	initializationFingerprint,
	state,
}: {
	database: Database;
	partitionKey: string;
	topic: string;
	partition: number;
	initializationId: string;
	initializationFingerprint: string;
	state: CustomerMeteringState;
}) => {
	database
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
	database,
	partitionKey,
	revisionBefore,
	state,
}: {
	database: Database;
	partitionKey: string;
	revisionBefore: number;
	state: CustomerMeteringState;
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
				deduplicationExpiresAt: bigint;
				outcomeJson: string;
			}
		>(`
			INSERT INTO track_receipts (
				partition_key,
				command_id,
				topic,
				partition_id,
				record_offset,
				deduplication_expires_at,
				outcome_json
			)
			VALUES (
				$partitionKey,
				$commandId,
				$topic,
				$partition,
				$offset,
				$deduplicationExpiresAt,
				$outcomeJson
			)
		`)
		.run({
			partitionKey,
			commandId: receipt.commandId,
			topic: position.topic,
			partition: position.partition,
			offset: position.offset,
			deduplicationExpiresAt: BigInt(receipt.deduplicationExpiresAt),
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
