import type {
	DeductionDecision,
	MutationEffect,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import { subjectsToBalanceWebhooks } from "@autumn/balance-webhooks";
import { decideAutoTopupEffects } from "./decideAutoTopupEffects.js";

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
