import {
	type MeteringIdentity,
	meteringPartitionKeyOf,
	type SubjectStateMutation,
} from "@autumn/balance-engine";
import type { KafkaRecordPosition } from "../../types/kafkaRecordPosition.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import type { StoredMutationReceipt } from "../../types/storedMutationReceipt.js";
import {
	type MutationReceiptRow,
	storedMutationReceiptFromRow,
} from "./mutationReceiptRow.js";

type ReceiptWriteParams = {
	partitionKey: string;
	mutationId: string;
	topic: string;
	partition: number;
	offset: bigint;
	fingerprint: string;
	expiresAt: bigint;
	mutationJson: string;
};

const selectColumns = `
	partition_key AS partitionKey,
	mutation_id AS mutationId,
	topic,
	partition_id AS partition,
	record_offset AS recordOffset,
	fingerprint,
	expires_at AS expiresAt,
	mutation_json AS mutationJson
`;

const receiptWriteParamsOf = ({
	partitionKey,
	position,
	mutation,
}: {
	partitionKey: string;
	position: KafkaRecordPosition;
	mutation: SubjectStateMutation;
}): ReceiptWriteParams => ({
	partitionKey,
	mutationId: mutation.id,
	topic: position.topic,
	partition: position.partition,
	offset: position.offset,
	fingerprint: mutation.receipt.fingerprint,
	expiresAt: BigInt(mutation.receipt.expiresAt),
	mutationJson: JSON.stringify(mutation),
});

export const readReceipt = ({
	ctx,
	identity,
	mutationId,
}: {
	ctx: StateStoreContext;
	identity: MeteringIdentity;
	mutationId: string;
}): StoredMutationReceipt | null => {
	const partitionKey = meteringPartitionKeyOf({ identity });
	const row = ctx.sqliteDb
		.query<MutationReceiptRow, { partitionKey: string; mutationId: string }>(`
			SELECT ${selectColumns}
			FROM mutation_receipts
			WHERE partition_key = $partitionKey AND mutation_id = $mutationId
		`)
		.get({ partitionKey, mutationId });
	if (!row) return null;
	return storedMutationReceiptFromRow({ row });
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
}): StoredMutationReceipt[] =>
	ctx.sqliteDb
		.query<
			MutationReceiptRow,
			{ topic: string; partition: number; createdAt: bigint; limit: number }
		>(`
			SELECT ${selectColumns}
			FROM mutation_receipts
			WHERE topic = $topic
				AND partition_id = $partition
				AND expires_at > $createdAt
			ORDER BY record_offset
			LIMIT $limit
		`)
		.all({ topic, partition, createdAt: BigInt(createdAt), limit })
		.map((row) => storedMutationReceiptFromRow({ row }));

export const insertReceipt = ({
	ctx,
	partitionKey,
	position,
	mutation,
}: {
	ctx: StateStoreContext;
	partitionKey: string;
	position: KafkaRecordPosition;
	mutation: SubjectStateMutation;
}) => {
	ctx.sqliteDb
		.query<never, ReceiptWriteParams>(`
			INSERT INTO mutation_receipts (
				partition_key,
				mutation_id,
				topic,
				partition_id,
				record_offset,
				fingerprint,
				expires_at,
				mutation_json
			)
			VALUES (
				$partitionKey,
				$mutationId,
				$topic,
				$partition,
				$offset,
				$fingerprint,
				$expiresAt,
				$mutationJson
			)
		`)
		.run(receiptWriteParamsOf({ partitionKey, position, mutation }));
};

/** Guarded by record_offset so a replayed older copy never rewinds the stored receipt. */
export const updateReceipt = ({
	ctx,
	partitionKey,
	position,
	mutation,
}: {
	ctx: StateStoreContext;
	partitionKey: string;
	position: KafkaRecordPosition;
	mutation: SubjectStateMutation;
}) =>
	ctx.sqliteDb
		.query<never, ReceiptWriteParams>(`
			UPDATE mutation_receipts
			SET record_offset = $offset,
				fingerprint = $fingerprint,
				expires_at = $expiresAt,
				mutation_json = $mutationJson
			WHERE partition_key = $partitionKey AND mutation_id = $mutationId
				AND topic = $topic AND partition_id = $partition
				AND record_offset < $offset
		`)
		.run(receiptWriteParamsOf({ partitionKey, position, mutation }));

export const deleteExpiredReceipts = ({
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
			DELETE FROM mutation_receipts
			WHERE rowid IN (
				SELECT rowid
				FROM mutation_receipts
				WHERE topic = $topic
					AND partition_id = $partition
					AND expires_at <= $expiresAtOrBefore
				ORDER BY expires_at, record_offset
				LIMIT $limit
			)
		`)
		.run({
			topic,
			partition,
			expiresAtOrBefore: BigInt(expiresAtOrBefore),
			limit,
		});
