import type {
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
}: {
	mutation: SubjectStateMutation;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
}): MutationEffect[] => [
	...subjectsToBalanceWebhooks({ mutation, before, after }),
	...decideAutoTopupEffects({ mutation, after }),
];
