import type {
	BalanceWebhookEffect,
	DeductionOutcome,
	SubjectStateMutation,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import { isBalanceChange } from "./common/classifyChange/isBalanceChange.js";
import { mayFireBalanceWebhooks } from "./common/classifyDeduction/mayFireBalanceWebhooks.js";
import { mutationToAffectedFeatures } from "./common/convertMutation/mutationToAffectedFeatures.js";
import {
	mutationToCheckCommand,
	mutationToTrackedFeature,
} from "./common/convertMutation/mutationToCheckCommand.js";
import { checkLimitReached } from "./limitReached/checkLimitReached.js";
import { checkUsageAlerts } from "./usageAlerts/checkUsageAlerts.js";

/**
 * Every webhook one mutation calls for, given the subject as it found it and as it left it: each check
 * runs for each feature the mutation moved (the tracked one, and a credit system that paid for it).
 * With the deduction behind it, a mutation that provably fires nothing skips the checks.
 */
export const subjectsToBalanceWebhooks = ({
	mutation,
	before,
	after,
	deduction,
}: {
	mutation: SubjectStateMutation;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
	deduction?: DeductionOutcome;
}): BalanceWebhookEffect[] => {
	// Only a mutation that moved a tracked feature can call for one; others are never crossed.
	const tracked = mutationToTrackedFeature({ mutation });
	if (!tracked || !mutation.changes.some(isBalanceChange)) return [];
	if (deduction && !mayFireBalanceWebhooks({ mutation, before, deduction }))
		return [];

	const commands = mutationToAffectedFeatures({
		mutation,
		fullSubject: after,
		trackedFeatureId: tracked.featureId,
	}).flatMap((feature) => mutationToCheckCommand({ mutation, feature }) ?? []);

	return commands.flatMap((command) => [
		...checkLimitReached({ command, before, after }),
		...checkUsageAlerts({ command, before, after }),
	]);
};
