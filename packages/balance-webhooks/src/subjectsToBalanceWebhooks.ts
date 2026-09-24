import type {
	BalanceWebhookEffect,
	SubjectStateMutation,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import { isBalanceChange } from "./common/classifyChange/isBalanceChange.js";
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
 */
export const subjectsToBalanceWebhooks = ({
	mutation,
	before,
	after,
}: {
	mutation: SubjectStateMutation;
	before: WorkerFullSubject;
	after: WorkerFullSubject;
}): BalanceWebhookEffect[] => {
	// Only a mutation that moved a tracked feature can call for one; others are never crossed.
	const tracked = mutationToTrackedFeature({ mutation });
	if (!tracked || !mutation.changes.some(isBalanceChange)) return [];

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
