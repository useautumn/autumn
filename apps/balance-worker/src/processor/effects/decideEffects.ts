import type {
	DeductionOutcome,
	MutationEffect,
	SubjectStateMutation,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import { subjectsToBalanceWebhooks } from "@autumn/balance-webhooks";
import { decideAutoTopupEffects } from "./decideAutoTopupEffects.js";

/** What must happen elsewhere because of this mutation, decided over the subject as it found it and as it left it. */
export const decideEffects = ({
	mutation,
	before,
	after,
	deduction,
}: {
	mutation: SubjectStateMutation;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
	/** The deduction the mutation was made from. */
	deduction: DeductionOutcome;
}): MutationEffect[] => [
	...subjectsToBalanceWebhooks({ mutation, before, after, deduction }),
	...(process.env.EXP_NOTOPUP ? [] : decideAutoTopupEffects({ mutation, after })),
];
