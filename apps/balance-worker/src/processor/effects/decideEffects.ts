import type {
	DeductionDecision,
	MutationEffect,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import { subjectsToBalanceWebhooks } from "@autumn/balance-webhooks";
import { decideAutoTopupEffects } from "./decideAutoTopupEffects.js";

/** What must happen elsewhere because of this decision, read off the deduction and the subject as it found it and as it left it. */
export const decideEffects = ({
	decision: { mutation, outcome },
	before,
	after,
}: {
	decision: DeductionDecision;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
}): MutationEffect[] => [
	...subjectsToBalanceWebhooks({ mutation, outcome, before, after }),
	...decideAutoTopupEffects({ mutation, after }),
];
