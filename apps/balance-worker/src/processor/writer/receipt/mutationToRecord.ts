import type {
	MutationRecord,
	MutationSource,
	SubjectStateMutation,
} from "@autumn/balance-engine";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";

export const mutationToRecord = ({
	mutation,
	fingerprint,
	receiptPolicy,
	source,
}: {
	mutation: SubjectStateMutation;
	fingerprint: string;
	receiptPolicy: ReceiptPolicy;
	source?: MutationSource;
}): MutationRecord => ({
	...mutation,
	receipt: {
		fingerprint,
		expiresAt: receiptPolicy.now() + receiptPolicy.retentionMs,
	},
	...(source && { source }),
});
