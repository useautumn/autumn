import type { CustomerStateMutation } from "@autumn/balance-engine";

export type StoredMutationReceipt = {
	partitionKey: string;
	recordOffset: bigint;
	mutation: CustomerStateMutation;
};
