import type {
	DbUsageAlert,
	DbUsageAlertParams,
} from "../../models/cusModels/billingControls/usageAlert.js";
import { isUsageLimitBasisAlert } from "../../models/cusModels/billingControls/usageAlertIdentity.js";
import {
	type UsageLimitFilter,
	type UsageLimitFilterParams,
	usageLimitFilterKey,
	usageLimitIdentity,
} from "../../models/cusModels/billingControls/usageLimit.js";

type UsageAlertLike = DbUsageAlert | DbUsageAlertParams;

const usageLimitIdentityForAlert = (alert: UsageAlertLike): string =>
	`${alert.feature_id ?? ""}|${usageLimitFilterKey(alert.filter)}`;

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
	usageLimitLists: Array<
		| Array<{
				feature_id: string;
				filter?: UsageLimitFilter | UsageLimitFilterParams | null;
		  }>
		| null
		| undefined
	>;
}): Array<{ index: number; usageAlert: UsageAlertLike }> => {
	const limitIdentities = new Set(
		usageLimitLists.flatMap((list) => (list ?? []).map(usageLimitIdentity)),
	);

	return usageAlerts.flatMap((usageAlert, index) =>
		isUsageLimitBasisAlert(usageAlert) &&
		!limitIdentities.has(usageLimitIdentityForAlert(usageAlert))
			? [{ index, usageAlert }]
			: [],
	);
};
