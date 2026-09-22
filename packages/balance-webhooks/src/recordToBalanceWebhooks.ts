import type { MutationRecord } from "@autumn/balance-engine";
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
 */
export const recordToBalanceWebhooks = ({
	record,
}: {
	record: MutationRecord;
}): BalanceWebhook[] => {
	const subjects = recordToSubjects({ record });
	const tracked = recordToTrackedFeature({ record });
	if (!subjects || !tracked) return [];

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
