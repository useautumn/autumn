import type { TrackOutcome } from "@autumn/balance-engine";

export type StoredPartitionReceipt = {
	partitionKey: string;
	recordOffset: bigint;
	outcome: TrackOutcome;
};
