import type { Catalog, MutationRecord } from "@autumn/balance-engine";
import { recordToAffectedFeatures } from "./common/convertRecord/recordToAffectedFeatures.js";
import {
	recordToCheckCommand,
	recordToTrackedFeature,
} from "./common/convertRecord/recordToCheckCommand.js";
import { recordToSubjects } from "./common/convertRecord/recordToSubjects.js";
import { checkLimitReached } from "./limitReached/checkLimitReached.js";
import type { BalanceWebhook } from "./types/balanceWebhook.js";
import { checkUsageAlerts } from "./usageAlerts/checkUsageAlerts.js";

/**
 * Every webhook one record of the balance log calls for: the subject before and after the mutation, run through
 * each check for each feature the mutation moved (the tracked one, and a credit system that paid for it).
 * The catalog is the caller's: the log carries the subject's rows, not the plan rows they reference.
 */
export const recordToBalanceWebhooks = ({
	record,
	catalog,
}: {
	record: MutationRecord;
	catalog: Catalog;
}): BalanceWebhook[] => {
	// Only a record that moved a tracked feature can call for one; others are never reverted.
	const tracked = recordToTrackedFeature({ record });
	if (!tracked) return [];
	const subjects = recordToSubjects({ record, catalog });
	if (!subjects) return [];

	const commands = recordToAffectedFeatures({
		record,
		fullSubject: subjects.after,
		trackedFeatureId: tracked.featureId,
	}).flatMap((feature) => recordToCheckCommand({ record, feature }) ?? []);

	return commands.flatMap((command) => [
		...checkLimitReached({ command, ...subjects }),
		...checkUsageAlerts({ command, ...subjects }),
	]);
};
