import type {
	DbUsageAlert,
	DbUsageAlertParams,
} from "../../models/cusModels/billingControls/usageAlert.js";
import {
	isUsageLimitBasisAlert,
	usageAlertTargetLimitIdentity,
} from "../../models/cusModels/billingControls/usageAlertIdentity.js";
import {
	type DbUsageLimit,
	type DbUsageLimitParams,
	usageLimitIdentity,
} from "../../models/cusModels/billingControls/usageLimit.js";

type UsageAlertLike = DbUsageAlert | DbUsageAlertParams;
type UsageLimitLike = Pick<
	DbUsageLimit | DbUsageLimitParams,
	"feature_id" | "filter"
>;

/**
 * usage_limit alerts whose (feature_id, filter) matches no limit in any of the
 * given lists. Disabled limits still count as present: disabling a cap makes
 * its alert dormant, not invalid.
 */
export const findUnresolvableUsageLimitAlerts = ({
	usageAlerts,
	usageLimitLists,
}: {
	usageAlerts: UsageAlertLike[];
	usageLimitLists: Array<UsageLimitLike[] | null | undefined>;
}): Array<{ index: number; usageAlert: UsageAlertLike }> => {
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
