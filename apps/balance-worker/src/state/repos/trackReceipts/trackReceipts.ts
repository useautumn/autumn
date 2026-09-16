import {
	type MeteringIdentity,
	meteringPartitionKeyOf,
	type TrackOutcome,
} from "@autumn/balance-engine";
import type { KafkaRecordPosition } from "../../types/kafkaRecordPosition.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import type { StoredPartitionReceipt } from "../../types/storedPartitionReceipt.js";

import { type ReceiptRow, storedReceiptFromRow } from "./trackReceiptRow.js";

export const readTrackReceipt = ({
	ctx,
	identity,
	commandId,
}: {
	ctx: StateStoreContext;
	identity: MeteringIdentity;
	commandId: string;
}): TrackOutcome | null => {
	const partitionKey = meteringPartitionKeyOf({ identity });
	const row = ctx.sqliteDb
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
	ctx,
	topic,
	partition,
	createdAt,
	limit,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	createdAt: number;
	limit: number;
}): StoredPartitionReceipt[] =>
	ctx.sqliteDb
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

export const insertTrackReceipt = ({
	ctx,
	partitionKey,
	position,
	receipt,
}: {
	ctx: StateStoreContext;
	partitionKey: string;
	position: KafkaRecordPosition;
	receipt: TrackOutcome;
}) => {
	ctx.sqliteDb
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

export const updateTrackReceipt = ({
	ctx,
	partitionKey,
	position,
	receipt,
}: {
	ctx: StateStoreContext;
	partitionKey: string;
	position: KafkaRecordPosition;
	receipt: TrackOutcome;
}) =>
	ctx.sqliteDb
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
			UPDATE track_receipts
			SET record_offset = $offset,
				deduplication_expires_at = $deduplicationExpiresAt,
				outcome_json = $outcomeJson
			WHERE partition_key = $partitionKey AND command_id = $commandId
				AND topic = $topic AND partition_id = $partition
				AND record_offset < $offset
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

export const deleteExpiredTrackReceipts = ({
	ctx,
	topic,
	partition,
	expiresAtOrBefore,
	limit,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	expiresAtOrBefore: number;
	limit: number;
}) =>
	ctx.sqliteDb
		.query<
			never,
			{
				topic: string;
				partition: number;
				expiresAtOrBefore: bigint;
				limit: number;
			}
		>(`
			DELETE FROM track_receipts
			WHERE rowid IN (
				SELECT rowid
				FROM track_receipts
				WHERE topic = $topic
					AND partition_id = $partition
					AND deduplication_expires_at <= $expiresAtOrBefore
				ORDER BY deduplication_expires_at, record_offset
				LIMIT $limit
			)
		`)
		.run({
			topic,
			partition,
			expiresAtOrBefore: BigInt(expiresAtOrBefore),
			limit,
		});
