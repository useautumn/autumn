import type { MutationRecord } from "@autumn/balance-engine";

export type StoredMutationReceipt = {
	partitionKey: string;
	recordOffset: bigint;
	mutation: MutationRecord;
};
