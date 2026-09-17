import type {
	MutationRecord,
	SubjectStateMutation,
} from "@autumn/balance-engine";
import type { ReceiptPolicy } from "../../types/receiptPolicy.js";

/** Stamps the writer's receipt onto what the engine decided: the record the log, store and checkpoint hold. */
export const mutationToRecord = ({
	mutation,
	fingerprint,
	receiptPolicy,
}: {
	mutation: SubjectStateMutation;
	fingerprint: string;
	receiptPolicy: ReceiptPolicy;
}): MutationRecord => ({
	...mutation,
	receipt: {
		fingerprint,
		expiresAt: receiptPolicy.now() + receiptPolicy.retentionMs,
	},
});
