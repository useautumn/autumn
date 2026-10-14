import type {
	BalanceWebhookEffect,
	DeductionOutcome,
	SubjectStateMutation,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import { isBalanceChange } from "./common/classifyChange/isBalanceChange.js";
import {
	mutationToCheckCommand,
	mutationToTrackedFeature,
} from "./common/convertMutation/mutationToCheckCommand.js";
import { outcomeToAffectedFeatures } from "./common/convertOutcome/outcomeToAffectedFeatures.js";
import { checkLimitReached } from "./limitReached/checkLimitReached.js";
import { checkUsageAlerts } from "./usageAlerts/checkUsageAlerts.js";

export const subjectsToBalanceWebhooks = ({
	mutation,
	outcome,
	before,
	after,
}: {
	mutation: SubjectStateMutation;
	outcome: DeductionOutcome;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
}): BalanceWebhookEffect[] => {
	const tracked = mutationToTrackedFeature({ mutation });
	if (!tracked || !mutation.changes.some(isBalanceChange)) return [];

	const commands = outcomeToAffectedFeatures({
		outcome,
		fullSubject: after,
		trackedFeatureId: tracked.featureId,
	}).flatMap((feature) => mutationToCheckCommand({ mutation, feature }) ?? []);

	return commands.flatMap((command) => [
		...checkLimitReached({ command, outcome, before, after }),
		...checkUsageAlerts({ command, before, after }),
	]);
};
