import {
	type CheckCommand,
	type DeductionOutcome,
	deductionOutcomeToMovedFeatures,
	isFeatureFundedAfterDeduction,
	type SubjectStateMutation,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import type { Feature } from "@autumn/shared";
import { resolveAlertScopes } from "../../usageAlerts/resolveAlertScopes.js";
import { mutationToCheckCommand } from "../convertMutation/mutationToCheckCommand.js";

/** Alerts are config, and a deduction never moves config, so the subject as found answers for both sides. */
const hasEnabledUsageAlerts = ({
	command,
	before,
	feature,
}: {
	command: CheckCommand;
	before: WorkerFullSubject;
	feature: Feature;
}): boolean =>
	resolveAlertScopes({ command, fullSubject: before, feature }).some((scoped) =>
		scoped.alerts.some((alert) => alert.enabled),
	);

/** The feature is still allowed after the deduction, and nothing is configured to watch it cross a threshold. */
const isQuietFeature = ({
	mutation,
	before,
	deduction,
	feature,
}: {
	mutation: SubjectStateMutation;
	before: WorkerFullSubject;
	deduction: DeductionOutcome;
	feature: Feature;
}): boolean => {
	const command = mutationToCheckCommand({ mutation, feature });
	if (!command) return false;
	const stillAllowed = isFeatureFundedAfterDeduction({
		outcome: deduction,
		featureId: feature.id,
		value: command.requiredBalance,
		org: command.org,
	});
	return stillAllowed && !hasEnabledUsageAlerts({ command, before, feature });
};

/**
 * False only when the deduction itself proves nothing can fire: every feature it moved is quiet.
 * Anything it cannot prove goes through the full before/after checks.
 */
export const mayFireBalanceWebhooks = ({
	mutation,
	before,
	deduction,
}: {
	mutation: SubjectStateMutation;
	before: WorkerFullSubject;
	deduction: DeductionOutcome;
}): boolean => {
	const movedFeatures = deductionOutcomeToMovedFeatures({ outcome: deduction });
	if (movedFeatures.length === 0) return true;
	return !movedFeatures.every((feature) =>
		isQuietFeature({ mutation, before, deduction, feature }),
	);
};
