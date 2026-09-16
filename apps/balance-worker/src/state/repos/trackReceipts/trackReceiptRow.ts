import {
	meteringPartitionKeyOf,
	parseTrackOutcome,
} from "@autumn/balance-engine";
import { CorruptBalanceStateError } from "../../sqliteBalanceStateErrors.js";
import type { StoredPartitionReceipt } from "../../types/storedPartitionReceipt.js";

export type ReceiptRow = {
	partitionKey: string;
	commandId: string;
	topic: string;
	partition: bigint;
	recordOffset: bigint;
	deduplicationExpiresAt: bigint;
	outcomeJson: string;
};

export const storedReceiptFromRow = ({
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
