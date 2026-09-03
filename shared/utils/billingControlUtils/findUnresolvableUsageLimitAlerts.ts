import { isUsageLimitBasisAlert } from "../../models/cusModels/billingControls/classify/isUsageLimitBasisAlert.js";
import { usageAlertTargetLimitIdentity } from "../../models/cusModels/billingControls/identity/usageAlertTargetLimitIdentity.js";
import type { DbUsageAlertLike } from "../../models/cusModels/billingControls/usageAlert.js";
import {
	type DbUsageLimitLike,
	usageLimitIdentity,
} from "../../models/cusModels/billingControls/usageLimit.js";

/**
 * usage_limit alerts whose (feature_id, filter) matches no limit in any of the
 * given lists. Disabled limits still count as present: disabling a cap makes
 * its alert dormant, not invalid.
 */
export const findUnresolvableUsageLimitAlerts = ({
	usageAlerts,
	usageLimitLists,
}: {
	usageAlerts: DbUsageAlertLike[];
	usageLimitLists: Array<
		Array<Pick<DbUsageLimitLike, "feature_id" | "filter">> | null | undefined
	>;
}): Array<{ index: number; usageAlert: DbUsageAlertLike }> => {
	const limitIdentities = new Set(
		usageLimitLists.flatMap((list) => (list ?? []).map(usageLimitIdentity)),
	);

	return usageAlerts.flatMap((usageAlert, index) =>
		isUsageLimitBasisAlert(usageAlert) &&
		!limitIdentities.has(usageAlertTargetLimitIdentity(usageAlert))
			? [{ index, usageAlert }]
			: [],
	);
};
