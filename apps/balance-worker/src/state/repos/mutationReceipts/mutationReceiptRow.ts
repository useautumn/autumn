import {
	meteringPartitionKeyOf,
	parseSubjectStateMutation,
} from "@autumn/balance-engine";
import { CorruptBalanceStateError } from "../../stateStoreErrors.js";
import type { StoredMutationReceipt } from "../../types/storedMutationReceipt.js";

export type MutationReceiptRow = {
	partitionKey: string;
	mutationId: string;
	topic: string;
	partition: bigint;
	recordOffset: bigint;
	fingerprint: string;
	expiresAt: bigint;
	mutationJson: string;
};

export const storedMutationReceiptFromRow = ({
	row,
}: {
	row: MutationReceiptRow;
}): StoredMutationReceipt => {
	const mutation = parseSubjectStateMutation({
		input: JSON.parse(row.mutationJson),
	});
	if (
		mutation.id !== row.mutationId ||
		mutation.receipt.fingerprint !== row.fingerprint ||
		meteringPartitionKeyOf({ identity: mutation.identity }) !==
			row.partitionKey ||
		BigInt(mutation.receipt.expiresAt) !== row.expiresAt ||
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
		mutation,
	};
};
