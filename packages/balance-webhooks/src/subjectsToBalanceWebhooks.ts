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

/**
 * Every webhook one mutation calls for, given the deduction behind it and the subject as it found it and as it
 * left it: each check runs for each feature the deduction moved (the tracked one, and a credit system that paid for it).
 */
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
	// Only a mutation that moved a tracked feature can call for one; others are never crossed.
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
