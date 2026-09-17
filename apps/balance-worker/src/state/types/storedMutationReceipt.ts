import type { SubjectStateMutation } from "@autumn/balance-engine";

export type StoredMutationReceipt = {
	partitionKey: string;
	recordOffset: bigint;
	mutation: SubjectStateMutation;
};
